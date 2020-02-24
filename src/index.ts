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
    merge,
    Subject,
} from "rxjs";

import {
    concatMap,
    filter,
    map,
    switchMap,
    tap,
} from "rxjs/operators";

import { RxMqtt } from "./rx-mqtt";

import ConfigManager, { IRelayConfig, IRelayOutputConfig } from "./config";

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

interface IRelayOutputConfigWithMQTT extends IRelayOutputConfig {
    config: IMQTTLightConfig;
}

interface IRelayConfigWithMQTT extends IRelayConfig {
    outputs: IRelayOutputConfigWithMQTT[];
}

enum TYPES {
    toggle,
    on,
    off,
    poll,
}

interface IActionType {
    type: TYPES;
};

interface IRelayAction extends IActionType {
    type: TYPES.toggle | TYPES.on | TYPES.off;
    location: string;
};

interface IPollAction extends IActionType {
    type: TYPES.poll;
    location: number;
};

const debug = DEBUG("dobiss2mqtt.index");

// This preps the config and moves it into several observables.
// As soon as the config changes and it impacts this part of the config it will emit a new value.
const configManager = new ConfigManager(process.env.CONFIG_PATH || "../config");

const commands$: Subject<IRelayAction | IPollAction> = new Subject();

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

            // Now we will create observables for every type of command.
            const actions$ = commands$
                .pipe(
                    filter((item) => item.type === TYPES.toggle || item.type === TYPES.on || item.type === TYPES.off),
                    map((item) => {
                        // Grab the location to perform the actions on.
                        const location = state.getLocation(item.location as string);

                        if (!location) {
                            return empty();
                        }

                        // 0x02 is toggle which should be OK for now
                        const buffer = createRelayAction(location.relay, location.output, 0x02);

                        if (!buffer) {
                            return empty();
                        }

                        return socketClient
                            .send(buffer)
                            .pipe(
                                map((output) => {
                                    return {
                                        input: item,
                                        output,
                                    };
                                }),
                            );
                    }),
                );

            // Polls are requests we emit to ask the state of the relays.
            const polls$ = commands$
                .pipe(
                    filter((item) => item.type === TYPES.poll),
                    map((item) => {
                        const response$ = socketClient
                            .send(createPingForState({ relais: item.location as number }));

                        return response$
                            .pipe(
                                map((output) => {
                                    return {
                                        input: item,
                                        output,
                                    };
                                }),
                            );
                    }),
                );

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
                                // We want an observable to manage the full relay.
                                // And we will merge these puppies.
                                // TODO: This will be an observable which will emit an item whenever it notices an output changed state.
                                const actionRequests$ = merge(
                                    ...relay.outputs
                                        .map((output) => {
                                            return mqttClient
                                                .subscribe$(output.config["~"] + output.config.cmd_t.slice(1))
                                                .pipe(
                                                    map((request) => {
                                                        return { request: JSON.parse(request), output };
                                                    }),
                                                    tap({
                                                        next: ({ request, output }) => {
                                                            commands$.next({ type: TYPES.on, location: output.name });
                                                        },
                                                    }),
                                                );
                                        }),
                                );

                                // Send discovery info for all the configured devices.
                                // So this will be an array of observables which will each emit the config for every output.
                                const config$ = merge(
                                    ...relay
                                        .outputs
                                        .map((output) => {
                                            return mqttClient
                                                .publish$(
                                                    `homeassistant/light/${output.config.unique_id}/config`, output.config,
                                                );
                                        }),
                                );

                                return merge(config$, actionRequests$);

                                // TODO: Per device, periodically emit a config. Or does MQTT sometimes require config to be sent ? If so we should add a Subject for this.
                                // TODO: Per device, listen on the command_topic for state changes.
                                //       On a state change request -> emit an command.
                            });

                        return merge(...observables);
                    }),
                );

            // TODO: Also expose the Dobiss CAN Controller as a device ? So it's nice & neat in the device explorer ?

            /*

            */

            // TMP STUFF
            /*
            const SWITCH_TOPIC = "dobiss/light/set";

            const mqttTap = {
                next(d: any) {
                    console.log("MQTT", d);
                },
                error(e: Error) {
                    console.error("MQTT", e);
                },
                complete() {
                    console.log("MQTT DONE");
                },
            };

            const switches$ = mqttClient
                .subscribe$(SWITCH_TOPIC)
                .pipe(
                    tap(mqttTap),
                );
            */
            // END TMP STUFF

            // We make sure to provice an observable of observables.
            // Every internal observable will complete when the jorb is done.
            // So that the next observable can start.
            // This way it's impossible to do multiple things at once on the socket.
            const socketOperations$ = merge(actions$, polls$)
                .pipe(
                    // In the processor we will concatMap these so that we only do one action after the other.
                    // Because we can't use the socket at the same time ... this is an easy way to do it.
                    // This way the response of the socket will always be for the previous request too.
                    // TODO: Look into changing the socket implemtation so that it can only do 1 request at a time. Just to be safe.
                    concatMap((obs$) => {
                        return obs$;
                    }),
                );

            return merge(socketOperations$, relays$);
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

const toggleSalon: IRelayAction = { type: TYPES.toggle, location: "salon" };
const toggleEetplaats: IRelayAction = { type: TYPES.toggle, location: "eetplaats" };

const pollFirst: IPollAction = { type: TYPES.poll, location: 0x01 };
const pollSecond: IPollAction = { type: TYPES.poll, location: 0x02 };

// TODO: Create a service which will be based off of the config.
//       It will expose an initial state for every configured light.
//       If we push it states for a specific relais it will update the internal states of the lights.
//       This big service will emit the full state of the light whenever it has changed.
//       Everything needed to construct a message on mqtt to indicate the state of the light.
// TODO: Create something which, given the config, will expose a set of lights.
//commands$.next(toggleSalon);
//commands$.next(toggleEetplaats);
// commands$.next(pollFirst);

// MQTT
//
// send "ON" or "OFF" on each 'light state topic'.
// so we need to generate a topic per light.
// listens on a light switch topic. / command topic.
// where we will receive "ON" or "OFF".
