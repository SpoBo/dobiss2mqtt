import DEBUG from "debug";

import {
    connect,
    IClientPublishOptions,
    IPubrecPacket,
} from "mqtt";

import { Observable, fromEvent } from "rxjs";
import { shareReplay } from "rxjs/operators";

export interface ISimplifiedMqttClient {
    message$: Observable<[ string, Buffer, IPubrecPacket ]>;
    subscribe$: ({ topic }: { topic: string }) => Observable<any>;
    publish$: ({
        topic,
        payload,
        options,
    }: { topic: string; payload: string | Buffer; options?: IClientPublishOptions }) => Observable<any>;
}

const debug = DEBUG("dobiss2mqtt.mqtt");

export default function mqtt (url: string): Observable<ISimplifiedMqttClient> {
    return new Observable((subscriber) => {
        debug("going to connect");

        const client = connect(url);

        client.on("close", () => {
            debug("close");
        });

        client.on("connect", () => {
            debug("connect");

            subscriber.next({
                message$: fromEvent(client, "message"),
                publish$: ({
                    options,
                    payload,
                    topic,
                }: { topic: string; payload: string | Buffer; options?: IClientPublishOptions }) => {
                    return new Observable((publishSubscriber) => {
                        if (!options) {
                            options = { qos: 1 };
                        }

                        client.publish(topic, payload, options, (err) => {
                            if (err) {
                                publishSubscriber.error(err);
                            }

                            publishSubscriber.complete();
                        });
                    });
                },
                subscribe$: ({ topic }: { topic: string }) => {
                    return new Observable((subscribeSubscriber) => {
                        client.subscribe(topic, (err) => {
                            if (err) {
                                subscribeSubscriber.error(err);
                            }

                            subscribeSubscriber.complete();
                        });
                    });
                },
            });
        });

        if (process.env.DEBUG_MQTT_EVENTS) {
            client.on("reconnect", () => {
                debug("reconnect");
            });

            client.on("disconnect", () => {
                debug("disconnect");
            });

            client.on("offline", () => {
                debug("offline");
            });

            client.on("error", () => {
                debug("error");
            });

            client.on("message", (msg) => {
                debug("message", msg);
            });

            client.on("packetsend", (packet) => {
                debug("packetsend", packet);
            });

            client.on("packetreceive", (packet) => {
                debug("packereceive", packet);
            });
        }

        client.on("end", () => {
            subscriber.complete();

            if (process.env.DEBUG_MQTT_EVENTS) {
                debug("end");
            }
        });

        return () => {
            debug("request for socket termination");
            client.end();
        };
    })
    .pipe(
        // This hacky stuff is needed because of TypeScript.
        // Can this be fixed ?
        // In any case shareReplay is needed otherwise we thrash the socket after our first connection.
        (v) => shareReplay(1)(v) as Observable<ISimplifiedMqttClient>,
    );
}
