import {
    from,
    Observable,
} from "rxjs";

import {
    mapTo,
    switchMap,
} from "rxjs/operators";

import SocketClient from "../rx-socket";

import {
    IDobiss2MqttModule,
    IDobiss2MqttOutput,
    ModuleType,
} from "../config";

import {
    IDobissProtocol,
    IOutputState,
} from "../dobissSelector";

import {
    convertBufferToByteArray,
} from "../helpers";

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
            0x40, // dimmer (64 = 100%)
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

    private socketClient: SocketClient;

    constructor({ socketClient }: { socketClient: SocketClient }) {
        this.socketClient = socketClient;
    }

    public off (module: IDobiss2MqttModule, output: IDobiss2MqttOutput): Observable<null> {
        return this.action(module, output, ACTION_TYPES.off);
    }

    public on (module: IDobiss2MqttModule, output: IDobiss2MqttOutput): Observable<null> {
        return this.action(module, output, ACTION_TYPES.on);
    }

    public pollModule (module: IDobiss2MqttModule): Observable<IOutputState> {
        const requestBufffer = createHeaderPayload({
            code: HEADER_TYPE_CODE.poll,
            colDataCount: 0,
            moduleAddress: module.address,
            moduleType: module.type,
        });

        return this.socketClient
            .send(requestBufffer)
            .pipe(
                switchMap((response) => {
                    const byteArray = convertBufferToByteArray(response);
                    const startBit = 4 * 8;
                    const states = byteArray.slice(startBit, startBit + 12);

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
    }

    private action (module: IDobiss2MqttModule, output: IDobiss2MqttOutput, actionType: number): Observable<null> {
        const header = createActionHeaderPayload(
            {
                moduleAddress: module.address,
                moduleType: module.type,
            },
        );

        const body = createSimpleActionBuffer(
            {
                actionType,
                moduleAddress: module.address,
                outputAddress: output.address,
            },
        );

        const buffer = Buffer.concat([ header, body ]);

        return this.socketClient
            .send(buffer)
            .pipe(
                mapTo(null),
            );
    }

}
