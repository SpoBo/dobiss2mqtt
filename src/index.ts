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
    concatMap,
    distinctUntilChanged,
    filter,
    groupBy,
    map,
    mergeMap,
    switchMap,
    tap,
} from "rxjs/operators";

import DobissState,
{
    createPingForState,
    createRelayAction,
} from "./dobiss";

import SocketClient from "./rx-socket";

import { RxMqtt } from "./rx-mqtt";

import ConfigManager from "./config";
import { convertBufferToByteArray } from "./helpers";

enum ACTION_TYPES {
    toggle,
    on,
    off,
    poll,
}

const debug = DEBUG("dobiss2mqtt.index");

// This preps the config and moves it into several observables.
// As soon as the config changes and it impacts this part of the config it will emit a new value.
const configManager = new ConfigManager(process.env.CONFIG_PATH || "../config");

const state$ = configManager
    .outputs$
    .pipe(
        map((relayConfig) => {
            return new DobissState(relayConfig);
        }),
    );

/**
 * I know this is overkill.
 *
 * But now we will not need to restart the service when the config changes :p
 */
const processor$ = combineLatest(state$, configManager.dobissCANController$, configManager.mqtt$)
    .pipe(
        switchMap(([ state, canControllerConfig, mqttConfig ]) => {
            // Create a SocketClient which will kick into gear when we need it.
            const socketClient = new SocketClient({
                host: canControllerConfig.host,
                port: canControllerConfig.port,
            });

            // Create the MQTT client which will also kick into gear when we need it.
            const mqttClient = new RxMqtt(mqttConfig.url);

            const relaysWithMQTTConfig$ = configManager
                .relays$
                .pipe(
                    map((relays) => {
                        return relays
                        .map((relay) => {
                            return {
                                ...relay,
                                outputs: relay
                                    .outputs
                                    .map((output) => {
                                        const id = `dobiss_mqtt_${canControllerConfig.host.replace(/\./g, "_")}_output_${output.relay}x${output.output}`;

                                        return {
                                            ...output,
                                            config: {
                                                "~": `homeassistant/light/${id}`,
                                                "cmd_t": `~/set`,
                                                "schema": "json",
                                                "device": {
                                                  manufacturer: "Dobiss",
                                                  //name: "CAN Controller Relay Output Switch",
                                               },
                                                "name": output.name,
                                                "optimistic": false,
                                                // TODO: Check how we can suport dimmers. Don't have a dimmer though.
                                                "brightness": false,
                                                "stat_t": `~/state`,
                                                "unique_id": id,
                                            },
                                        };
                                    }),
                            };
                        });
                    }),
                );

            const relays$ = relaysWithMQTTConfig$
                .pipe(
                    switchMap((relays) => {
                        // This will contain an observable per relay.
                        // That observable will manage everything for all outputs on that relay.
                        // Discovery, listening to MQTT, emitting states on statechange, etc.
                        const observables = relays
                            .map((relay) => {
                                // This will listen to state change requests and emit a command relevant to the state request.
                                const actionRequests$ = merge(
                                    ...relay.outputs
                                        .map((output) => {
                                            return mqttClient
                                                // TODO: replace '~' with config['~']
                                                .subscribe$(output.config["~"] + output.config.cmd_t.slice(1))
                                                .pipe(
                                                    map((request) => {
                                                        return { request: JSON.parse(request), output };
                                                    }),
                                                    switchMap(({ request, output }) => {
                                                        const type = request.state === "ON" ? ACTION_TYPES.on : ACTION_TYPES.off;

                                                        // Grab the location to perform the actions on.
                                                        const location = { output: output.output, relay: output.relay };

                                                        if (!location) {
                                                            return empty();
                                                        }

                                                        const buffer = createRelayAction(location.relay, location.output, type);

                                                        if (!buffer) {
                                                            return empty();
                                                        }

                                                        return socketClient
                                                            .send(buffer)
                                                            .pipe(
                                                                tap({
                                                                    next() {
                                                                        // As a side-effect trugger a manual ping on success.
                                                                        manualPing$
                                                                            .next("manual");
                                                                    },
                                                                }),
                                                            );
                                                    }),
                                                );
                                        }),
                                );

                                // TODO: Make this configurable. 500 seems nice though.
                                const periodicallyRequest$ = interval(500);

                                const manualPing$ = new Subject();

                                const polls$ = merge(periodicallyRequest$, manualPing$)
                                    .pipe(
                                        switchMap(() => {
                                            return socketClient
                                                .send(createPingForState({ relais: relay.id }))
                                                .pipe(
                                                    switchMap((response) => {
                                                        const byteArray = convertBufferToByteArray(response);
                                                        const startBit = 4 * 8;
                                                        const states = byteArray.slice(startBit, startBit + 12);

                                                        const combined = states
                                                            .map((state, index) => {
                                                                const output = relay
                                                                    .outputs
                                                                    .find((output) => {
                                                                        return output.output === index;
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
                                                    },
                                                ));
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
                                                            );
                                                    }),
                                                );
                                        }),
                                    );

                                // Send discovery info for all the configured devices.
                                // So this will be an array of observables which will each emit
                                // the config for every output.
                                // TODO: Do we do this on an interval ?
                                //       Do we do this after a specific mqtt request ?
                                const config$ = merge(
                                    ...relay
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

            // TODO: Also expose the Dobiss CAN Controller as a device ? So it's nice & neat in the device explorer ?

            return merge(socketClient.consume$, relays$);
        }),
    );

processor$
    .subscribe({
        error(e) {
            debug("ERROR %o", e);
        },
        complete() {
            debug("completed processor");
        },
    });
