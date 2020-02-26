import DEBUG from "debug";

import { connect, IPubrecPacket, MqttClient } from "mqtt";

import { concat, fromEvent, Observable } from "rxjs";
import { filter, map, shareReplay, switchMap, tap } from "rxjs/operators";

const debug = DEBUG("dobiss2mqtt.mqtt");

interface ISimplifiedMqttClient {
    message$: Observable<[ string, Buffer, IPubrecPacket ]>;
    subscribe$: ({ topic }: { topic: string }) => Observable<any>;
    publish$: ({ topic, payload }: { topic: string, payload: string | Buffer }) => Observable<any>;
}

export class RxMqtt {
    private client$: Observable<ISimplifiedMqttClient>;

    constructor(url: string) {
        this.client$ = client(url);
    }

    public subscribe$(topic: string) {
        return this.client$
            .pipe(
                switchMap((d) => {
                    const subscribe$ = d.subscribe$({ topic });

                    const replies$ = d.message$
                        .pipe(
                            filter(([ incomingTopic ]) => incomingTopic === topic),
                            tap({
                                next(out) {
                                    debug("message response for %s is %o", topic, out);
                                },
                            }),
                            map(([ _, buffer ]) => buffer.toString()),
                        );

                    return concat(subscribe$, replies$);
                }),
            );
    }

    public publish$(topic: string, payload: string | Buffer | object) {
        return this.client$
            .pipe(
                switchMap((d) => {
                    if (typeof payload === "object") {
                        payload = JSON.stringify(payload);
                    }

                    return d.publish$({ topic, payload });
                }),
            );
    }
}

function client (url: string): Observable<ISimplifiedMqttClient> {
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
                publish$: ({ topic, payload }: { topic: string, payload: string | Buffer }) => {
                    return new Observable((publishSubscriber) => {
                        client.publish(topic, payload, (err) => {
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

        client.on("end", () => {
            subscriber.complete();
            debug("end");
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
