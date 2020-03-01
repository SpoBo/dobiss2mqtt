import DEBUG from "debug";

import {
    combineLatest,
    empty,
    interval,
    merge,
    of,
    Subject,
    timer,
} from "rxjs";

import {
    catchError,
    distinctUntilChanged,
    groupBy,
    map,
    mergeMap,
    switchMap,
    switchMapTo,
    take,
    tap,
} from "rxjs/operators";

import { RxMqtt } from "./rx-mqtt";

import ConfigManager, { ModuleType } from "./config";
import dobissSelector from "./dobissSelector";

import RxSocket from "./rx-socket";

const DOBISS_NAMESPACE = "dobiss";

const debug = DEBUG("dobiss2mqtt.index");

// This preps the config and moves it into several observables.
// As soon as the config changes and it impacts this part of the config it will emit a new value.
// /data/config.js is the default location if we run under docker and mount the data folder.
const configManager = new ConfigManager(process.env.CONFIG_PATH || "/data/config.js");

/**
 * I know this is overkill.
 */
const processor$ = combineLatest(
        configManager.dobiss$,
        configManager.mqtt$,
    )
    .pipe(
        switchMap(([ dobissConfig, mqttConfig ]) => {
            const canIdentifier = `${DOBISS_NAMESPACE}_mqtt_${dobissConfig.host.replace(/\./g, "_")}`;

            // Create a SocketClient which will kick into gear when we need it.
            const socketClient = new RxSocket({
                host: dobissConfig.host,
                port: dobissConfig.port,
            });

            const dobiss = dobissSelector(dobissConfig, socketClient);

            // Create the MQTT client which will also kick into gear when we need it.
            const mqttClient = new RxMqtt(mqttConfig.url);

            const relaysWithMQTTConfig$ = configManager
                .modules$
                .pipe(
                    map((modules) => {
                        return modules
                        .map((module) => {
                            if (module.type !== ModuleType.relay) {
                                throw new Error("Only relay modules are supported for now.");
                            }

                            return {
                                ...module,
                                outputs: module
                                    .outputs
                                    .map((output) => {
                                        const outputId = `output_${module.address}x${output.address}`;
                                        const id = `${canIdentifier}_${outputId}`;

                                        return {
                                            ...output,
                                            config: {
                                                "cmd_t": `~/set`,
                                                "device": {
                                                  identifiers: [
                                                      `${DOBISS_NAMESPACE}_${outputId}`,
                                                  ],
                                                  manufacturer: "Dobiss",
                                                  name: output.name,
                                                  /* eslint-disable-next-line @typescript-eslint/camelcase */
                                                  via_device: canIdentifier,
                                               },
                                                "name": output.name,
                                                "optimistic": false,
                                                "schema": "json",
                                                "stat_t": `~/state`,
                                                "unique_id": id,
                                                "~": `homeassistant/light/${id}`,
                                            },
                                        };
                                    }),
                            };
                        });
                    }),
                );

            const relays$ = relaysWithMQTTConfig$
                .pipe(
                    switchMap((modules) => {
                        // This will contain an observable per relay.
                        // That observable will manage everything for all outputs on that relay.
                        // Discovery, listening to MQTT, emitting states on statechange, etc.
                        const observables = modules
                            .map((module) => {
                                const manualPing$ = new Subject();

                                const actionRequests$ = merge(
                                    ...module.outputs
                                        .map((output) => {
                                            return mqttClient
                                                .subscribe$(output.config.cmd_t.replace("~", output.config["~"]))
                                                .pipe(
                                                    map((request) => {
                                                        return { request: JSON.parse(request) };
                                                    }),
                                                    switchMap(({ request }) => {
                                                        debug('request to set state to %s for module %d and output %d', request.state, module.address, output.address)
                                                        const action$ = request.state === "ON"
                                                            ?
                                                            dobiss.on(module, output)
                                                            :
                                                            dobiss.off(module, output);

                                                        return action$
                                                            .pipe(
                                                                tap({
                                                                    next() {
                                                                        debug('completed request to set state to %s for module %d and output %d (%s)', request.state, module.address, output.address, output.name)
                                                                        // As a side-effect,
                                                                        // trigger a manual ping on success.
                                                                        manualPing$
                                                                            .next("manual");
                                                                    },
                                                                }),
                                                                // TODO: retry mechanism here
                                                            );
                                                    }),
                                                );
                                        }),
                                );


                                const periodicallyRequest$ = configManager.pollInterval$
                                    .pipe(
                                        switchMap((pollInterval) => {
                                            if (!pollInterval) {
                                                debug("polling disabled")
                                                return empty()
                                            }

                                            debug("polling interval is %d", pollInterval);
                                            return interval(pollInterval)
                                        })
                                    );

                                const polls$ = merge(periodicallyRequest$, manualPing$)
                                    .pipe(
                                        switchMap(() => {
                                            debug('start polling module %d', module.address)
                                            return dobiss
                                                .pollModule(module);
                                        }),
                                    );

                                const outputStates$ = merge(polls$)
                                    .pipe(
                                        // Create an observable per unique_id and monitor a change in state
                                        // for every output in order to push it to mqtt.
                                        groupBy((v) => v.output.address),
                                        mergeMap((states$) => {
                                            const address$ = states$
                                                .pipe(
                                                    map((state) => state.output.address),
                                                    take(1),
                                                );

                                            const outputForAddress$ = address$
                                                .pipe(
                                                    switchMap((address) => {
                                                        const output = module
                                                            .outputs
                                                            .find((outputWithConfig) => outputWithConfig.address === address);

                                                        if (!output) {
                                                            return empty();
                                                        }

                                                        return of(output);
                                                    }),
                                                );

                                            const latestState$ = states$
                                                .pipe(
                                                    // Only continue when the state effectively changed.
                                                    distinctUntilChanged((a, b) => {
                                                        return a.powered === b.powered;
                                                    }),
                                                    tap({
                                                        next(a) {
                                                            debug('detected change of powered state to %s for module %d and output %d (%s)', a.powered, module.address, a.output.address, a.output.name)
                                                        }
                                                    }),
                                                );

                                            return combineLatest(latestState$, outputForAddress$)
                                                .pipe(
                                                    switchMap(([ update, output ]) => {
                                                        if (!update) {
                                                            return empty();
                                                        }

                                                        const payload = JSON.stringify({
                                                            state: update.powered ? "ON" : "OFF",
                                                        });

                                                        return mqttClient
                                                            .publish$(
                                                                // TODO: get the configured url for the endpoint.
                                                                output.config.stat_t.replace("~", output.config["~"]),
                                                                payload,
                                                                {
                                                                    qos: 1,
                                                                    retain: true,
                                                                },
                                                            );
                                                    }),
                                                );
                                        }),
                                    );

                                // Send discovery info for all the configured devices.
                                // So this will be an array of observables which will each emit
                                // the config for every output.
                                const config$ = merge(
                                    ...module
                                        .outputs
                                        .map((output) => {
                                            return mqttClient
                                                .publish$(
                                                    `homeassistant/light/${output.config.unique_id}/config`,
                                                    output.config,
                                                );
                                        }),
                                );

                                return merge(config$, actionRequests$, outputStates$);
                            });

                        return merge(...observables);
                    }),
                );

            return merge(
                socketClient.consume$,
                relays$,
            );
        }),
    );

processor$
    .pipe(
        catchError((e, obs$) => {
            console.error(e);

            return timer(5000)
                .pipe(switchMapTo(obs$));
        }),
    )
    .subscribe({
        complete() {
            debug("completed processor");
        },
    });
