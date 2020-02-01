import { convertBufferToByteArray } from "./helpers";
import DEBUG from "debug";
import { Observable } from "rxjs";
import { Socket, SocketConnectOpts } from "net";

const debug = DEBUG("dobiss2mqtt.socket");

export class SocketClient {
    private socket: Socket;

    constructor(socket: Socket) {
        this.socket = socket;
    }

    public send(input: Buffer): Observable<Buffer> {
        // TODO: create a queue mechanism.
        //       we could ask for a slot on the queue and be nexted when it's our time.
        return new Observable((subscriber) => {
            debug("writing hex %o, ascii: %o", input.toString("hex"), convertBufferToByteArray(input));
            this.socket.write(input);

            this.socket.once("data", (output) => {
                const byteArray = convertBufferToByteArray(output);
                debug("received hex %o, ascii %o", output.toString("hex"), byteArray);

                subscriber.next(output);
                subscriber.complete();
            });
        });
    }
}

// TODO: Expose a cleaner API from the socket.
//       I'd like to just do a write / response mechanism ... .
//       With an internal queue.
export default function socket (opts: SocketConnectOpts): Observable<SocketClient> {
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
            subscriber.next(new SocketClient(client));
        });

        return () => {
            debug("request for socket termination");
            client.end();
        };
    });
}
