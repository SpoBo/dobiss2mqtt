import DEBUG from "debug";

import {
    combineLatest,
    empty,
    from,
    interval,
    merge,
    Subject,
} from "rxjs";

import {
    distinctUntilChanged,
    groupBy,
    map,
    mergeMap,
    switchMap,
    tap,
} from "rxjs/operators";

import {
    createPingForState,
    createRelayAction,
} from "./dobiss";

import SocketClient from "./rx-socket";

import { RxMqtt } from "./rx-mqtt";

import ConfigManager, { IRelayOutputConfig } from "./config";
import { convertBufferToByteArray } from "./helpers";

const POLL_INTERVAL_IN_MS = Number(process.env.POLL_INTERVAL_IN_MS) || 500;

enum ACTION_TYPES {
    toggle,
    on,
    off,
    poll,
}

const debug = DEBUG("dobiss2mqtt.index");

// This preps the config and moves it into several observables.
// As soon as the config changes and it impacts this part of the config it will emit a new value.
const configManager = new ConfigManager(process.env.CONFIG_PATH || "/data/config");

/**
 * I know this is overkill.
 */
const processor$ = combineLatest(configManager.dobissCANController$, configManager.mqtt$)
    .pipe(
        switchMap(([ canControllerConfig, mqttConfig ]) => {
            // Create a SocketClient which will kick into gear when we need it.
            const socketClient = new SocketClient({
                host: canControllerConfig.host,
                port: canControllerConfig.port,
            });

            // Create the MQTT client which will also kick into gear when we need it.
            const mqttClient = new RxMqtt(mqttConfig.url);

            function createId (output: IRelayOutputConfig, ip: string) {
                return `dobiss_mqtt_${ip.replace(/\./g, "_")}_output_${output.relay}x${output.output}`;
            }

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
                                        const id = createId(output, canControllerConfig.host);

                                        return {
                                            ...output,
                                            config: {
                                                "cmd_t": `~/set`,
                                                "device": {
                                                  manufacturer: "Dobiss",
                                                  name: output.name,
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
                    switchMap((relays) => {
                        // This will contain an observable per relay.
                        // That observable will manage everything for all outputs on that relay.
                        // Discovery, listening to MQTT, emitting states on statechange, etc.
                        const observables = relays
                            .map((relay) => {
                                const actionRequests$ = merge(
                                    ...relay.outputs
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

                                                        // Grab the location to perform the actions on.
                                                        const location = { output: output.output, relay: output.relay };

                                                        if (!location) {
                                                            return empty();
                                                        }

                                                        const buffer = createRelayAction(
                                                            location.relay,
                                                            location.output,
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
                                                            );
                                                    }),
                                                );
                                        }),
                                );

                                const periodicallyRequest$ = interval(POLL_INTERVAL_IN_MS);

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
                                                                    .find((item) => {
                                                                        return item.output === index;
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

            return merge(
                socketClient.consume$,
                relays$,
            );
        }),
    );

processor$
    .subscribe({
        error(e) {
            console.error("ERROR %o", e);
            // 5s cooldown after crash to not spam everything should the process be restarted immediately.
            setTimeout(() => {
                process.exit(1);
            }, 5000);
        },
        complete() {
            debug("completed processor");
        },
    });
