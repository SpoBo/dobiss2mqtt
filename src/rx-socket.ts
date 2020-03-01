import DEBUG from "debug";

import { fromEvent, Observable, Subject } from "rxjs";

import {
    concatMap,
    share,
    switchMap,
    take,
    tap,
    timeout,
} from "rxjs/operators";

import { Socket, SocketConnectOpts } from "net";

import { convertBufferToByteArray } from "./helpers";

import socket from "./socket"

const debug = DEBUG("dobiss2mqtt.rx-socket");

/**
 * This is a basic interface which determines that the object can send a request buffer
 * and is expected to receive a response buffer for that request.
 *
 * The full RxSocket API is not really needed for the dobiss protocols.
 */
export interface IRequestResponseBuffer {
    request(input: Buffer): Observable<Buffer>;
}

export default class RxSocket implements IRequestResponseBuffer {
    private socket$: Observable<Socket>;

    private queue: Subject<Observable<Buffer>>;

    constructor(opts: SocketConnectOpts) {
        this.queue = new Subject();
        this.socket$ = socket(opts);
    }

    public request(input: Buffer): Observable<Buffer> {
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

