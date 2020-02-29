import {
    from,
    Observable,
    of,
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
    toggle = 2,
    on = 1,
    off = 0,
}

enum HEADER_TYPE_CODE {
    action = 2,
    poll = 1,
}

const HEADER_DEFAULTS = {
    colDataCount: 8,
    colMaxCount: 8,
    high: 0,
    low: 0,
    rowCount: 1,
};

type HeaderPayloadOptions = {
    code: HEADER_TYPE_CODE,
    moduleType: ModuleType,
    moduleAddress: number,
    colDataCount?: number,
};

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
            175,
            code,
            convertModuleTypeToNumber(moduleType),
            moduleAddress,
            high,
            low,
            colMaxCount,
            rowCount,

            colDataCount,
            255,
            255,
            255,
            255,
            255,
            255,
            175,
        ]);
}

function createActionHeaderPayload (options: { moduleType: ModuleType, moduleAddress: number }) {
    return createHeaderPayload({
        code: HEADER_TYPE_CODE.action,
        moduleAddress: options.moduleAddress,
        moduleType: options.moduleType,
    });
}

type SimpleActionBufferOptions = {
    moduleAddress: number,
    outputAddress: number,
    actionType: ACTION_TYPES,
};

function createSimpleActionBuffer(options: SimpleActionBufferOptions): Buffer {
    return Buffer
        .from([
            options.moduleAddress,
            options.outputAddress,
            options.actionType,
            255, // delay on
            255, // delay off
            64, // dimmer (64 = 100%)
            255, // dimmer speed
            255, // not used
        ]);
}

function convertModuleTypeToNumber(moduleType: ModuleType): number {
    switch (moduleType) {
        case ModuleType.relay:
            return 8;
        case ModuleType.dimmer:
            return 10;
        case ModuleType.volt:
            return 18;
        default:
            throw new Error("Unmapped ModuleType");
    }
}
