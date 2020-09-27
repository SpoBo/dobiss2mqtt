import DEBUG from "debug";

import {
    from,
    Observable,
    empty,
} from "rxjs";

import {
    mapTo,
    switchMap,
    map,
} from "rxjs/operators";

import { IRequestResponseBuffer } from "../rx-socket";

import {
    IDobiss2MqttModule,
    IDobiss2MqttOutput,
    ModuleType,
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

const debug = DEBUG("dobiss2mqtt.protocol.ambiance-pro");

enum ACTION_TYPES {
    toggle = 0x02,
    on = 0x01,
    off = 0x00,
}

enum HEADER_TYPE_CODE {
    action = 0x02,
    poll = 0x01,
}

const HEADER_DEFAULTS = {
    colDataCount: 0x08,
    colMaxCount: 0x08,
    high: 0x00,
    low: 0x00,
    rowCount: 0x01,
};

type HeaderPayloadOptions = {
    code: HEADER_TYPE_CODE;
    moduleType: ModuleType;
    moduleAddress: number;
    colDataCount?: number;
};

type SimpleActionBufferOptions = {
    moduleAddress: number;
    outputAddress: number;
    actionType: ACTION_TYPES;
    level?: number;
};

function convertModuleTypeToNumber(moduleType: ModuleType): number {
    switch (moduleType) {
        case ModuleType.relay:
            return 0x08;
        case ModuleType.dimmer:
            return 0x10;
        case ModuleType.volt:
            return 0x18;
        default:
            throw new Error("Unmapped ModuleType");
    }
}

function createSimpleActionBuffer(options: SimpleActionBufferOptions): Buffer {
    return Buffer
        .from([
            options.moduleAddress,
            options.outputAddress,
            options.actionType,
            0xFF, // delay on
            0xFF, // delay off
            options.level ?? 0x64, // dimmer (0x0 to 0x64 = 100%) So it's basically 100%.
            0xFF, // dimmer speed
            0xFF, // not used
        ]);
}

// A header is a 16bit buffer, Delimited by 175 for start and end.
function createHeaderPayload (options: HeaderPayloadOptions) {
    const {
        code,
        moduleType,
        moduleAddress,
        high,
        low,
        colMaxCount,
        rowCount,
        colDataCount,
    } = { ...HEADER_DEFAULTS, ...options };

    return Buffer
        .from([
            0xAF,
            code,
            convertModuleTypeToNumber(moduleType),
            moduleAddress,
            high,
            low,
            colMaxCount,
            rowCount,

            colDataCount,
            0xFF,
            0xFF,
            0xFF,
            0xFF,
            0xFF,
            0xFF,
            0xAF,
        ]);
}

function createActionHeaderPayload (options: { moduleType: ModuleType; moduleAddress: number }) {
    return createHeaderPayload({
        code: HEADER_TYPE_CODE.action,
        moduleAddress: options.moduleAddress,
        moduleType: options.moduleType,
    });
}

export default class AmbiancePRO implements IDobissProtocol {
    private socketClient: IRequestResponseBuffer;
    private _modules$: Observable<IDobiss2MqttModule>;

    constructor({ socketClient, modules$ }: { socketClient: IRequestResponseBuffer; modules$: Observable<IDobiss2MqttModule> }) {
        this.socketClient = socketClient;
        this._modules$ = modules$;
    }

    public off (moduleAddress: number, outputAddress: number): Observable<null> {
        return this.modules$
            .pipe(
                withModuleAndOutput(moduleAddress, outputAddress),
                switchMap(([ module, output ]) => {
                    if (output) {
                        return this.action(module, output, ACTION_TYPES.off);
                    }

                    return empty()
                })
            )
    }

    public on (moduleAddress: number, outputAddress: number, level?: number): Observable<null> {
        return this.modules$
            .pipe(
                withModuleAndOutput(moduleAddress, outputAddress),
                switchMap(([ module, output ]) => {
                    if (output) {
                        return this.action(module, output, ACTION_TYPES.on, level);
                    }

                    return empty()
                })
            )
    }

    get modules$(): Observable<IDobiss2MqttModuleOnDobiss> {
        return this._modules$
            .pipe(
                map((module) => {
                    if (module.type === 'dimmer' || module.type === '0-10v') {
                        return {
                            ...module,
                            brightnessScale: 10
                        };
                    }

                    return module;
                })
            )
    }

    public pollModule (moduleAddress: number): Observable<IOutputState> {
        return this.modules$
            .pipe(
                withModuleAndOutput(moduleAddress),
                switchMap(([ module ]) => {
                    const requestBufffer = createHeaderPayload({
                        code: HEADER_TYPE_CODE.poll,
                        colDataCount: 0,
                        moduleAddress: module.address,
                        moduleType: module.type,
                    });

                    return this.socketClient
                        .request(requestBufffer)
                        .pipe(
                            switchMap((response) => {
                                const byteArray = convertBufferToByteArray(response);
                                debug('response of poll for module %d is %s', module.address, byteArray)
                                const startBit = 4 * 8;

                                const states = byteArray.slice(startBit, startBit + 12);
                                debug('states for above module poll response %s', states)

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

                                        const out: IOutputState = {
                                            output,
                                            powered: !!state,
                                        }

                                        if (output.dimmable && out.powered) {
                                            out.level = state;
                                        }

                                        acc.push(out);

                                        return acc;
                                    }, [] as IOutputState[]);

                                return from(combined);
                            }),
                        );
                })
            )
    }

    private action (module: IDobiss2MqttModule, output: IDobiss2MqttOutput, actionType: number, level?: number): Observable<null> {
        const header = createActionHeaderPayload(
            {
                moduleAddress: module.address,
                moduleType: module.type
            },
        );

        const body = createSimpleActionBuffer(
            {
                actionType,
                moduleAddress: module.address,
                outputAddress: output.address,
                level
            },
        );

        const buffer = Buffer.concat([ header, body ]);

        return this.socketClient
            .request(buffer)
            .pipe(
                mapTo(null),
            );
    }

}
