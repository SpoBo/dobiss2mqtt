import DEBUG from "debug";

import {
    combineLatest,
    empty,
    from,
    interval,
    merge,
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
    tap,
} from "rxjs/operators";

import {
    createPingForState,
    createRelayAction,
} from "./dobiss";

import SocketClient from "./rx-socket";

import { RxMqtt } from "./rx-mqtt";

import ConfigManager, { ModuleType } from "./config";
import { convertBufferToByteArray } from "./helpers";

const DOBISS_NAMESPACE = "dobiss";

enum ACTION_TYPES {
    toggle,
    on,
    off,
    poll,
}

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
        configManager.pollInterval$,
    )
    .pipe(
        switchMap(([ canConfig, mqttConfig, pollInterval ]) => {
            debug("polling interval is %d", pollInterval);

            const canIdentifier = `${DOBISS_NAMESPACE}_mqtt_${canConfig.host.replace(/\./g, "_")}`;

            // Create a SocketClient which will kick into gear when we need it.
            const socketClient = new SocketClient({
                host: canConfig.host,
                port: canConfig.port,
            });

            // Create the MQTT client which will also kick into gear when we need it.
            const mqttClient = new RxMqtt(mqttConfig.url);

            function createId (output: string, ip: string) {
                return `dobiss_mqtt__${output}`;
            }

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
                                                        const type = request.state === "ON"
                                                            ?
                                                            ACTION_TYPES.on
                                                            :
                                                            ACTION_TYPES.off;

                                                        const buffer = createRelayAction(
                                                            module.address,
                                                            output.address,
                                                            type,
                                                        );

                                                        if (!buffer) {
                                                            return empty();
                                                        }

                                                        return socketClient
                                                            .send(buffer)
                                                            .pipe(
                                                                tap({
                                                                    next() {
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

                                const periodicallyRequest$ = interval(pollInterval);

                                const manualPing$ = new Subject();

                                const polls$ = merge(periodicallyRequest$, manualPing$)
                                    .pipe(
                                        switchMap(() => {
                                            return socketClient
                                                .send(createPingForState({ moduleAddress: module.address }))
                                                .pipe(
                                                    switchMap((response) => {
                                                        const byteArray = convertBufferToByteArray(response);
                                                        const startBit = 4 * 8;
                                                        const states = byteArray.slice(startBit, startBit + 12);

                                                        const combined = states
                                                            .map((state, index) => {
                                                                const output = module
                                                                    .outputs
                                                                    .find((outputItem) => {
                                                                        return outputItem.address === index;
                                                                    });

                                                                if (!output) {
                                                                    return null;
                                                                }

                                                                return {
                                                                    config: output.config,
                                                                    state,
                                                                };
                                                            })
                                                            .filter((v) => v);

                                                        return from(combined);
                                                    }),
                                                );
                                        }),
                                    );

                                const outputStates$ = merge(polls$)
                                    .pipe(
                                        // Create an observable per unique_id and monitor a change in state
                                        // for every output in order to push it to mqtt.
                                        groupBy((v) => v?.config?.unique_id),
                                        mergeMap((states$) => {
                                            return states$
                                                .pipe(
                                                    // Only continue when the state effectively changed.
                                                    distinctUntilChanged((a, b) => {
                                                        return a?.state === b?.state;
                                                    }),
                                                    switchMap((update) => {
                                                        if (!update) {
                                                            return empty();
                                                        }

                                                        const payload = JSON.stringify({
                                                            state: update?.state ? "ON" : "OFF",
                                                        });

                                                        return mqttClient
                                                            .publish$(
                                                                update.config.stat_t.replace("~", update.config["~"]),
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
