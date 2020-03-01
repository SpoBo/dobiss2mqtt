import { Socket, SocketConnectOpts } from "net";

import { Observable } from "rxjs";

import {
    publishReplay,
    refCount,
} from "rxjs/operators";

import DEBUG from "debug";

const debug = DEBUG("dobiss2mqtt.socket")

export default function socket (opts: SocketConnectOpts): Observable<Socket> {
    return new Observable((subscriber) => {
        debug("going to connect");

        const client = new Socket();

        client
            .connect(opts);

        client.on("close", () => {
            debug("close");
        });

        client.on("data", (d) => {
            debug("data %o", d);
        });

        client.on("drain", () => {
            debug("drain");
        });

        client.on("end", () => {
            debug("end");
        });

        client.on("error", (e) => {
            debug("error", e.message);
            subscriber.error(e);
        });

        client.on("lookup", () => {
            debug("lookup");
        });

        client.on("timeout", () => {
            debug("timeout");
        });

        client.on("connect", () => {
            subscriber.next(client);
        });

        return () => {
            debug("request for socket termination");
            client.end();
        };
    })
    .pipe(
        // NOTE: We can also keep the socket online between requests by doing shareReplay(1) instead of publishReplay(1)
        //       This is interesting for people who don't care about the rest of the dobiss apps working.
        // NOTE: This hacky stuff `(v) => xx as Observable<Socket>` is needed because of TypeScript.
        //       Can this be fixed ?
        (v) => publishReplay(1)(v) as Observable<Socket>,
        refCount(),
    );
}
