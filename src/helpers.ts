export function convertBufferToByteArray (buffer: Buffer): number[] {
    const hexString = buffer.toString("hex");
    const hex = hexString.toString();
    const ints = [];

    // grab by the pairs and convert to ints
    for (let i = 0; i < hex.length; i += 2) {
        ints.push(parseInt(hex.substr(i, 2), 16));
    }

    return ints;
}
