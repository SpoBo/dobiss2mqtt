import DEBUG from "debug";
import { Socket, SocketConnectOpts } from "net";
import { fromEvent, Observable, Subject } from "rxjs";
import { concatMap, share, shareReplay, switchMap, take, tap, timeout } from "rxjs/operators";
import { convertBufferToByteArray } from "./helpers";

const debug = DEBUG("dobiss2mqtt.socket");

export default class SocketClient {
    private socket$: Observable<Socket>;

    private queue: Subject<Observable<Buffer>>;

    constructor(opts: SocketConnectOpts) {
        this.queue = new Subject();
        this.socket$ = socket(opts);
    }

    public send(input: Buffer): Observable<Buffer> {
        return new Observable((subscriber) => {
            const send$ = this.socket$
                .pipe(
                    switchMap((socket) => {
                        debug("writing hex %o, ascii: %o", input.toString("hex"), convertBufferToByteArray(input));

                        const done$ = (fromEvent(socket, "data") as Observable<Buffer>)
                            .pipe(
                                take(1),
                                timeout(5000),
                                tap({
                                    next(output: Buffer) {
                                        const byteArray = convertBufferToByteArray(output);
                                        debug("received hex %o, ascii %o", output.toString("hex"), byteArray);
                                    },
                                }),
                            );

                        socket.write(input);

                        return done$;
                    }),
                    // By taking only 1 we will always complete.
                    take(1),
                    tap({
                        next(value) {
                            subscriber.next(value);
                        },
                        error(error) {
                            subscriber.error(error);
                        },
                        complete() {
                            subscriber.complete();
                        },
                    }),
                );

            this.queue.next(send$);
        });
    }

    get consume$() {
        return this.queue
            .pipe(
                // In the processor we will concatMap these so that we only do one action after the other.
                // Because we can't use the socket at the same time ... this is an easy way to do it.
                // This way the response of the socket will always be for the previous request too.
                // We also made it so that every observable put on queue will actually complete.
                concatMap((obs$) => {
                    return obs$;
                }),
                share(),
            );
    }
}

function socket (opts: SocketConnectOpts): Observable<Socket> {
    return new Observable((subscriber) => {
        debug("going to connect");

        let client = new Socket();

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
        // This hacky stuff is needed because of TypeScript.
        // Can this be fixed ?
        // In any case shareReplay is needed otherwise we thrash the socket after our first connection.
        (v) => shareReplay(1)(v) as Observable<Socket>,
    );
}
