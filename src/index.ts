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

import ConfigManager from "./config";

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

const configManager = new ConfigManager(process.env.CONFIG_PATH || "../config");

const commands$: Subject<IRelayAction | IPollAction> = new Subject();

const state$ = configManager
    .relays$
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
            // Now we will create observables for every action.
            // In the processor we will concatMap these so that we do one action after the other.
            const actions$ = commands$
                .pipe(
                    filter((item) => item.type === TYPES.toggle || item.type === TYPES.on || item.type === TYPES.off),
                    map((item) => {
                        const location = state.getLocation(item.location as string);
                        if (!location) {
                            return empty();
                        }

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

            const socketClient = new SocketClient({
                host: canControllerConfig.host,
                port: canControllerConfig.port,
            });

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

            const SWITCH_TOPIC = "dobiss/light/set";

            const mqttClient = new RxMqtt(mqttConfig.url);

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

            const switches$ = mqttClient.subscribe$(SWITCH_TOPIC)
                .pipe(
                    tap(mqttTap)
                );

            const mqtt$ = switches$;

            // We make sure to provice an observable of observables.
            // Every internal observable will complete when the jorb is done.
            // So that the next observable can start.
            // This way it's impossible to do multiple things at once on the socket.
            const socketOperations$ = merge(actions$, polls$)
                .pipe(
                    concatMap((obs$) => {
                        return obs$;
                    }),
                );

            return merge(socketOperations$, mqtt$);
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
commands$.next(toggleSalon);
// commands$.next(toggleEetplaats);
// commands$.next(pollFirst);

// MQTT
//
// send "ON" or "OFF" on each 'light state topic'.
// so we need to generate a topic per light.
// listens on a light switch topic. / command topic.
// where we will receive "ON" or "OFF".

/*
function testDumbMqttLight() {
}
*/
