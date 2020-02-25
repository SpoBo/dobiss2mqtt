const HEADER_DEFAULTS = {
    colDataCount: 8,
    colMaxCount: 8,
    high: 0,
    low: 0,
    rowCount: 1,
};

// A header is a 16bit buffer, Delimited by 175 for start and end.
function createHeaderPayload (options: { code: number, type: number, relais: number, colDataCount?: number }) {
    const {
        code,
        type,
        relais,
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
        relais,
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
function createActionHeaderPayload (options: { type: number, relais: number }) {
    return createHeaderPayload({ type: options.type, relais: options.relais, code: 2 });
}
function createSimpleActionBuffer(options: { relais: number, output: number, action: number }): Buffer {
    return Buffer.from([options.relais, options.output, options.action, 255, 255, 64, 255, 255]);
}

export function createRelayAction(relais: number, output: number, action: number) {
    const header = createActionHeaderPayload(
        {
            type: 8,
            relais,
        },
    );

    const body = createSimpleActionBuffer(
        {
            relais,
            output,
            action,
        },
    );

    return Buffer.concat([ header, body ]);
}

export function createPingForState ({ relais }: { relais: number }) {
    return createHeaderPayload({
        code: 1,
        colDataCount: 0, // don't know why it needs to be 0 for data. maybe to allow a bigger response?
        relais,
        type: 8, // don't know what 8 is ... .
    });
}
