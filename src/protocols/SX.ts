import {
    concat,
    from,
    Observable,
} from "rxjs";

import {
    mapTo,
    switchMap,
} from "rxjs/operators";

import RxSocket from "../rx-socket";

import {
    IDobiss2MqttModule,
    IDobiss2MqttOutput,
} from "../config";

import {
    IDobissProtocol,
    IOutputState,
} from "../dobissSelector";

import {
    convertBufferToByteArray,
} from "../helpers";

enum ACTION_TYPES {
    on = 0x01,
    off = 0x00,
}

function convertModuleToModuleId(module: IDobiss2MqttModule) {
    return module.address + 40;
}

function createOutputsBuffer({ batch, moduleId }: { batch: IDobiss2MqttOutput[]; moduleId: number }): Buffer {
    // If there are not 24 modules we need to padd up the rest with 0xFF
    // So let's make sure we pad it if the batch is too small.
    return Buffer
        .from(new Array(24)
        .map((_, index) => {
            const output = batch[index];

            if (output) {
                return output.address;
            }

            return 0xFF;
        })
        .reduce((acc, item) => {
            return acc.concat([ moduleId, item ]);
        }, [] as number[]));
}

export default class AmbiancePRO implements IDobissProtocol {

    private socketClient: RxSocket;

    constructor({ socketClient }: { socketClient: RxSocket }) {
        this.socketClient = socketClient;
    }

    public off (module: IDobiss2MqttModule, output: IDobiss2MqttOutput): Observable<null> {
        return this.action(module, output, ACTION_TYPES.off);
    }

    public on (module: IDobiss2MqttModule, output: IDobiss2MqttOutput): Observable<null> {
        return this.action(module, output, ACTION_TYPES.on);
    }

    // TODO: add ability to dim

    public pollModule (module: IDobiss2MqttModule): Observable<IOutputState> {
        // We need to prefix this.
        const baseBuffer = Buffer
            .from([
               0xED,
               0x63,
               0x30,
               0x00,
               0x00,
               0x00,
               0x00,
               0x00,
               0x00,
               0x00,
               0x00,
               0x00,
               0x00,
               0x00,
               0xAF,
               0xAF,
            ]);

        // And then we can pack it with 4 digits to get the state of the output.
        // First 2 digits need to be the module id and the following 2 digits the id of the output.
        // We can poll up to 24 modules with this mechanism. So if we have more than 24 outputs we need to batch it per 24 outputs.
        const outputs = module
            .outputs
            .reduce((acc, output) => {
                let current = acc[acc.length - 1];
                if (!current) {
                    current = [];
                    acc.push(current);
                }

                if (acc.length < 24) {
                    current.push(output);
                }

                return acc;
            }, [] as IDobiss2MqttOutput[][])
        .map((batch) => {
            const outputsBuffer = createOutputsBuffer({ batch, moduleId: convertModuleToModuleId(module) });

            // now we map it to an observable.
            // NOTE: We need to construct a message where we tell Dobiss to give us the state for every light on this module.
            const requestBuffer = Buffer.concat([ baseBuffer, outputsBuffer ]);

            return this.socketClient
                .request(requestBuffer)
                .pipe(
                    switchMap((response) => {
                        const states = convertBufferToByteArray(response);

                        const combined = states
                            .reduce((acc, state, index) => {
                                const output = module
                                    .outputs
                                    .find((outputItem) => {
                                        return outputItem.address === index;
                                    });

                                if (!output) {
                                    return acc;
                                }

                                acc.push({
                                    output,
                                    powered: !!state,
                                });

                                return acc;
                            }, [] as IOutputState[]);

                        return from(combined);
                    }),
                );
        });

        return concat(...outputs);
    }

    private action (module: IDobiss2MqttModule, output: IDobiss2MqttOutput, actionType: number): Observable<null> {
        const buffer = Buffer
            .from([
                0xED,
                0x43,
                0x31,
                0x00,
                0x00,
                0x00,
                0x00,
                0x00,
                0x00,
                0x00,
                0x00,
                0x00,
                0x00,
                0x00,
                0xAF,
                0xAF,
                convertModuleToModuleId(module),
                output.address,
                actionType,
            ]);

        return this.socketClient
            .request(buffer)
            .pipe(
                mapTo(null),
            );
    }
}
