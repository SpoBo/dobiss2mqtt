import DEBUG from "debug";

import mqtt, { IPubrecPacket, MqttClient } from "mqtt";

import { concat, fromEvent, Observable } from "rxjs";
import { filter, map, shareReplay, switchMap, tap } from "rxjs/operators";

const debug = DEBUG("dobiss2mqtt.mqtt");

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
                                next(d) {
                                    debug("message response for %s is %o", topic, d);
                                },
                            }),
                            map(([ topic, buffer ]) => buffer.toString()),
                        );

                    return concat(subscribe$, replies$);
                }),
            );
    }
}

// try and share a single mqtt client.

interface ISimplifiedMqttClient {
    message$: Observable<[ string, Buffer, IPubrecPacket ]>;
    subscribe$: ({ topic }: { topic: string }) => Observable<any>;
}

function client (url: string): Observable<ISimplifiedMqttClient> {
    return new Observable((subscriber) => {
        debug("going to connect");

        const client = mqtt.connect(url);

        client.on("close", () => {
            debug("close");
        });

        client.on("connect", () => {
            debug("connect");

            subscriber.next({
                message$: fromEvent(client, "message"),
                subscribe$: ({ topic }: { topic: string }) => {
                    return new Observable((subscriber) => {
                        client.subscribe(topic, (err) => {
                            if (err) {
                                subscriber.error(err);
                            }

                            subscriber.complete();
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
