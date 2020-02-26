import { from, Observable } from "rxjs";

import { map } from "rxjs/operators";

type AllRelaysConfig = SingleRelayConfig[];
type SingleRelayConfig = string[];

export interface IRelayOutputConfig {
    relay: number;
    output: number;
    name: string;
}

export interface IRelayConfig {
    id: number;
    outputs: IRelayOutputConfig[];
}

export interface IDobissConfig {
    host: string;
    port: number;
}

export interface IMqttConfig {
    url: string;
}

export default class ConfigManager {

    private location: string;
    constructor(location: string) {
        this.location = location;
    }

    private get config$(): Observable<any> {
        const config = require(this.location);
        return from([ config ]);
    }

    // map the internal config to a bigger & better format.
    public get outputs$(): Observable<IRelayOutputConfig[]> {
        return this.config$
            .pipe(
                map(({ relays }) => relays as AllRelaysConfig),
                map((relays) => {
                    return relays
                        .reduce((acc, relay, relayIndex) => {
                            return relay
                                .reduce((innerAcc, name, relayItemIndex) => {
                                    innerAcc.push({
                                        output: relayItemIndex,
                                        relay: relayIndex + 1,
                                        name,
                                    });

                                    return innerAcc;
                                }, acc);
                        }, [] as IRelayOutputConfig[]);
                }),
            );
    }

    /**
     * Exposes the relay config in a structured way.
     * multiple relays. 1 relay has multiple outputs.
     */
    public get relays$(): Observable<IRelayConfig[]> {
        return this
            .outputs$
            .pipe(
                map((outputs) => {
                    // We will receive a list of outputs across all relays.
                    // We will group them per relay.
                    // Per relay we will have an interval to ask for the state of every output on the relay.
                    return outputs
                        .reduce((relays, output) => {
                            const relayIndex = output.relay - 1;
                            let relay = relays[relayIndex];

                            if (!relay) {
                                relay = {
                                    id: output.relay,
                                    outputs: [],
                                };

                                relays.push(relay);
                            }

                            relay.outputs.push(output);

                            return relays;
                        }, [] as IRelayConfig[]);
                }),
            );
    }

    /**
     * Exposes the CAN Programmer config.
     * This is just the host and the port.
     */
    public get dobissCAN$(): Observable<IDobissConfig> {
        return this.config$
            .pipe(
                map((config) => {
                    return config.dobiss;
                }),
            );
    }

    /**
     * Exposes the MQTT config.
     */
    public get mqtt$(): Observable<IMqttConfig> {
        return this.config$
            .pipe(
                map((config) => {
                    return config.mqtt;
                }),
            );
    }

}
