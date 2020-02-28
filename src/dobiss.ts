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

enum MODULE_TYPE {
    "0-10v" = 18,
    "dimmer" = 10,
    "relay" = 8,
};

type HeaderPayloadOptions = {
    code: HEADER_TYPE_CODE,
    moduleType: MODULE_TYPE,
    moduleAddress: number,
    colDataCount?: number,
};

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
            moduleType,
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

function createActionHeaderPayload (options: { type: number, moduleAddress: number }) {
    return createHeaderPayload({
        code: HEADER_TYPE_CODE.action,
        moduleAddress: options.moduleAddress,
        moduleType: options.type,
    });
}

function createSimpleActionBuffer(options: { moduleAddress: number, outputAddress: number, action: number }): Buffer {
    return Buffer
        .from([
            options.moduleAddress,
            options.outputAddress,
            options.action,
            255, // delay on
            255, // delay off
            64, // dimmer (64 = 100%)
            255, // dimmer speed
            255, // not used
        ]);
}

export function createRelayAction(moduleAddress: number, outputAddress: number, action: number) {
    const header = createActionHeaderPayload(
        {
            type: 8,
            moduleAddress,
        },
    );

    const body = createSimpleActionBuffer(
        {
            moduleAddress,
            outputAddress,
            action,
        },
    );

    return Buffer.concat([ header, body ]);
}

export function createPingForState ({ moduleAddress, moduleType }: { moduleAddress: number, moduleType: MODULE_TYPE }) {
    return createHeaderPayload({
        code: HEADER_TYPE_CODE.poll,
        colDataCount: 0,
        moduleAddress,
        moduleType,
    });
}
