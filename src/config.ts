import { empty, from, Observable } from "rxjs";
import { map } from "rxjs/operators";

type AllRelaysConfig = SingleRelayConfig[];
type SingleRelayConfig = string[];

export interface IRelayConfig {
    relay: number;
    output: number;
    id: string;
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
    public get relays$(): Observable<IRelayConfig[]> {
        return this.config$
            .pipe(
                map(({ relays }) => relays as AllRelaysConfig),
                map((relays) => {
                    return relays
                        .reduce((acc, relay, relayIndex) => {
                            return relay
                                .reduce((acc, id, relayItemIndex) => {
                                    acc.push({
                                        output: relayItemIndex,
                                        relay: relayIndex + 1,
                                        id,
                                    });

                                    return acc;
                                }, acc);
                        }, [] as IRelayConfig[]);
                }),
            );
    }

    public get dobissCANController$(): Observable<IDobissConfig> {
        return this.config$
            .pipe(
                map((config) => {
                    return config.dobiss;
                }),
            );
    }

    public get mqtt$(): Observable<IMqttConfig> {
        return this.config$
            .pipe(
                map((config) => {
                    return config.mqtt;
                }),
            );
    }

}
