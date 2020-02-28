const HEADER_DEFAULTS = {
    colDataCount: 8,
    colMaxCount: 8,
    high: 0,
    low: 0,
    rowCount: 1,
};

const MODULE_TYPE = {
    "0-10v": 18,
    "dimmer": 10,
    "relay": 8,
};

// A header is a 16bit buffer, Delimited by 175 for start and end.
function createHeaderPayload (options: { code: number, type: number, moduleAddress: number, colDataCount?: number }) {
    const {
        code,
        type,
        moduleAddress,
        high,
        low,
        colMaxCount,
        rowCount,
        colDataCount,
    } = { ...HEADER_DEFAULTS, ...options };

    return Buffer.from([
        175,
        code,
        type,
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

/**
 * @param {number} type
 * @param {number} address
 */
function createActionHeaderPayload (options: { type: number, moduleAddress: number }) {
    return createHeaderPayload({ type: options.type, moduleAddress: options.moduleAddress, code: 2 });
}
function createSimpleActionBuffer(options: { moduleAddress: number, outputAddress: number, action: number }): Buffer {
    return Buffer.from([options.moduleAddress, options.outputAddress, options.action, 255, 255, 64, 255, 255]);
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

export function createPingForState ({ moduleAddress }: { moduleAddress: number }) {
    return createHeaderPayload({
        code: 1,
        colDataCount: 0, // don't know why it needs to be 0 for data. maybe to allow a bigger response?
        moduleAddress,
        type: 8, // don't know what 8 is ... .
    });
}
