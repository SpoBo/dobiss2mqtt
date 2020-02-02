import DEBUG from "debug";
import { Socket, SocketConnectOpts } from "net";
import { fromEvent, Observable } from "rxjs";
import { shareReplay, switchMap, take, tap } from "rxjs/operators";
import { convertBufferToByteArray } from "./helpers";

const debug = DEBUG("dobiss2mqtt.socket");

export default class SocketClient {
    private socket$: Observable<Socket>;

    constructor(opts: SocketConnectOpts) {
        this.socket$ = socket(opts);
    }

    public send(input: Buffer): Observable<Buffer> {
        // TODO: build some kind of queue so that when we hit this mutliple times in a
        // row ... it schedules the next request to happen after the previous one has
        // completed.
        return this.socket$
            .pipe(
                switchMap((socket) => {
                    debug("writing hex %o, ascii: %o", input.toString("hex"), convertBufferToByteArray(input));

                    const done$ = (fromEvent(socket, "data") as Observable<Buffer>)
                        .pipe(
                            take(1),
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
                take(1),
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
