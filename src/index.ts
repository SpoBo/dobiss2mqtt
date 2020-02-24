import DEBUG from "debug";

import DobissState,
{
    createPingForState,
    createRelayAction,
} from "./dobiss";

import SocketClient from "./rx-socket";

import {
    combineLatest,
    empty,
    interval,
    merge,
    Subject,
    timer,
} from "rxjs";

import {
    concatMap,
    filter,
    map,
    switchMap,
    tap,
} from "rxjs/operators";

import { RxMqtt } from "./rx-mqtt";

import ConfigManager, { IRelayOutputConfig } from "./config";

interface IMQTTLightConfig {
    name: string;
    unique_id: string;
    command_topic: string;
    optimistic?: boolean;
    state_topic: string;
    device: {
        manufacturer?: string,
        name?: string,
    };
}

enum TYPES {
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
                                                .subscribe$(output.config["~"] + output.config.cmd_t.slice(1))
                                                .pipe(
                                                    map((request) => {
                                                        return { request: JSON.parse(request), output };
                                                    }),
                                                    switchMap(({ request, output }) => {
                                                        const type = request.state === "ON" ? TYPES.on : TYPES.off;

                                                        // Grab the location to perform the actions on.
                                                        const location = { output: output.output, relay: output.relay };

                                                        if (!location) {
                                                            return empty();
                                                        }

                                                        const buffer = createRelayAction(location.relay, location.output, type);

                                                        if (!buffer) {
                                                            return empty();
                                                        }

                                                        // TODO: We can try to emit a new state poll request for this relay when we know the state change was processed.
                                                        //       For this I think we will need to rejigger how we emit commands.
                                                        return socketClient
                                                            .send(buffer)
                                                            .pipe(
                                                                map((response) => {
                                                                    return {
                                                                        request,
                                                                        response,
                                                                        output,
                                                                    };
                                                                }),
                                                            );
                                                    }),
                                                );
                                        }),
                                );

                                // const requestState = new Subject()

                                // TODO: Periodically ping the state and keep a rolling state for every output. Only when a change of the state is detected will we emit the new state.
                                // TODO: Automatically ping the state after an action request.
                                const periodicallyRequest$ = interval(5000)
                                    .pipe(
                                        tap({
                                            next(v) {
                                                console.log("INTERVAL", v);
                                            },
                                        }),
                                    );

                                const polls$ = merge(periodicallyRequest$);
                                /*
                                  const response$ = socketClient
                                      .send(createPingForState({ relais: item.location as number }));
                                */

                                // TODO: We need a pipe where we emit events for every output.
                                //       The events will contain the config per output as well as the latest state.
                                //       We will then groupBy per unique_id
                                //       When we detect a change of state per unique_id (or the initial state) we will emit a message on MQTT indicating the new state for this specific output.
                                const outputStates$ = empty();

                                // Send discovery info for all the configured devices.
                                // So this will be an array of observables which will each emit the config for every output.
                                const config$ = merge(
                                    ...relay
                                        .outputs
                                        .map((output) => {
                                            // TODO: Do we do this on an interval ? Do we do this after a specific mqtt request ?
                                            return mqttClient
                                                .publish$(
                                                    `homeassistant/light/${output.config.unique_id}/config`, output.config,
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
        next: (out: any) => {
            debug("processed %o", out);
        },
        error(e) {
            debug("ERROR %o", e);
        },
        complete() {
            debug("completed processor");
        },
    });
