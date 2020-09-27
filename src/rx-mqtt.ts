import DEBUG from "debug";

import { connect, IClientPublishOptions, IPubrecPacket } from "mqtt";

import { concat, Observable } from "rxjs";
import { filter, map, switchMap, tap } from "rxjs/operators";

import mqttClient, { ISimplifiedMqttClient } from './mqtt'

const debug = DEBUG("dobiss2mqtt.rx-mqtt");

export class RxMqtt {
    private client$: Observable<ISimplifiedMqttClient>;

    constructor(url: string) {
        this.client$ = mqttClient(url);
    }

    public subscribe$(topic: string) {
        return this.client$
            .pipe(
                switchMap((d) => {
                    const subscribe$ = d.subscribe$({ topic });

                    const replies$ = d.message$
                        .pipe(
                            filter(([ incomingTopic ]) => incomingTopic === topic),
                            map(([ _, buffer ]) => buffer.toString()),
                            tap({
                                next(msg) {
                                    debug("got message for topic %s -> %s", topic, msg);
                                },
                            }),
                        );

                    return concat(subscribe$, replies$);
                }),
            );
    }

    public publish$(topic: string, payload: string | Buffer | object, options?: IClientPublishOptions) {
        return this.client$
            .pipe(
                switchMap((d) => {
                    if (typeof payload === "object") {
                        payload = JSON.stringify(payload);
                    }

                    return d.publish$({ topic, payload, options });
                }),
            );
    }
}
