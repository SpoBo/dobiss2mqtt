import {
    concat,
    from,
    Observable,
    empty,
} from "rxjs";

import {
    mapTo,
    switchMap,
    map,
} from "rxjs/operators";

import RxSocket, { IRequestResponseBuffer } from "../rx-socket";

import {
    IDobiss2MqttModule,
    IDobiss2MqttOutput,
} from "../config";

import {
    IDobissProtocol,
    IOutputState,
    IDobiss2MqttModuleOnDobiss,
} from "../dobissSelector";

import {
    convertBufferToByteArray,
} from "../helpers";
import withModuleAndOutput from "../operators/withModuleAndOutput";

enum ACTION_TYPES {
    on = 0x01,
    off = 0x00,
}

const BRIGHTNESS_SCALE = 10

function convertModuleToModuleId(module: IDobiss2MqttModule) {
    return module.address + 64;
}

function createOutputsBuffer({ batch, moduleId }: { batch: IDobiss2MqttOutput[]; moduleId: number }): Buffer {
    // If there are not 24 modules we need to padd up the rest with 0xFF
    // So let's make sure we pad it if the batch is too small.
    const arr: number[] = []

    for (let i = 0; i<24; i++) {
        const output = batch[i];

        if (output) {
            arr.push(output.address);
        } else {
            arr.push(0xFF);
        }
    }

    return Buffer
        .from(arr
              .reduce((acc, item) => {
                  return acc.concat([ item === 0xFF ? item : moduleId, item ]);
              }, [] as number[]))
}

export default class SX implements IDobissProtocol {

    // TODO: use moduleSelectorHelper to allow accepting just the address numbers for module and output.

    private socketClient: IRequestResponseBuffer;
    private _modules$: Observable<IDobiss2MqttModule>;

    constructor({ socketClient, modules$ }: { socketClient: IRequestResponseBuffer, modules$: Observable<IDobiss2MqttModule> }) {
        this.socketClient = socketClient;
        this._modules$ = modules$;
    }

    public off (moduleAddress: number, outputAddress: number): Observable<null> {
        return this.modules$
            .pipe(
                withModuleAndOutput(moduleAddress, outputAddress),
                switchMap(([ module, output ]) => {
                    if (output) {
                        return this.action(module, output, ACTION_TYPES.off)
                    }

                    return empty()
                })
            )
    }

    /**
     * @param {number} [brightness]
     *   Since we configure it to only step to 10 maximum, we will receive a value of 0-10 for brightness.
     */
    public on (moduleAddress: number, outputAddress: number, brightness?: number): Observable<null> {
        return this.modules$
            .pipe(
                withModuleAndOutput(moduleAddress, outputAddress),
                switchMap(([ module, output ]) => {
                    if (output) {
                        return this.action(module, output, ACTION_TYPES.on, brightness);
                    }

                    return empty()
                })
            )
    }

    get modules$(): Observable<IDobiss2MqttModuleOnDobiss> {
        return this._modules$
            .pipe(
                map((module) => {
                    if (module.type === 'dimmer') {
                        return {
                            ...module,
                            brightnessScale: BRIGHTNESS_SCALE
                        };
                    }

                    return module;
                })
            )
    }

    // TODO: add ability to dim. in that case we set the third argument to a value of 255 relative from 1 to 100.
    //       I wonder if reading the states will also tell how bright the lights are.

    public pollModule (moduleAddress: number): Observable<IOutputState> {
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

        return this.modules$
            .pipe(
                withModuleAndOutput(moduleAddress),
                switchMap(([ module ]) => {
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

                                                const result: IOutputState = {
                                                    output,
                                                    powered: !!state,
                                                }

                                                if (output.dimmable && module.brightnessScale) {
                                                    result.brightness = (state - (state % module.brightnessScale)) / module.brightnessScale
                                                }

                                                acc.push(result);

                                                return acc;
                                            }, [] as IOutputState[]);

                                        return from(combined);
                                    }),
                                );
                        });

                    // And then we can pack it with 4 digits to get the state of the output.
                    // First 2 digits need to be the module id and the following 2 digits the id of the output.
                    // We can poll up to 24 modules with this mechanism. So if we have more than 24 outputs we need to batch it per 24 outputs.
                    return concat(...outputs);
                })
            )
    }

    private action (module: IDobiss2MqttModule, output: IDobiss2MqttOutput, actionType: number, brightness?: number): Observable<null> {
        const action = getActionValue(actionType, output.dimmable, brightness)

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
                action,
            ]);

        return this.socketClient
            .request(buffer)
            .pipe(
                mapTo(null),
            );
    }
}


function getActionValue(actionType: number, dimmable: boolean, brightness?: number): number {
    if (!dimmable) {
        return actionType
    }

    return (brightness ?? (actionType === ACTION_TYPES.on ? 10 : 0)) * BRIGHTNESS_SCALE
}
