import { from, Observable } from "rxjs";

import { map } from "rxjs/operators";

import convict from "convict";

// I like JS config so sue me.
convict.addParser({
    extension: "js",
    parse: (v) => {
        // tslint:disable-next-line:no-eval
        return eval(v);
    },
});

convict.addFormat({
    name: "mqtt-locator",
    validate: (v: any) => {
        if (!v) {
            throw new TypeError("Need to provide something like mqtt://ip");
        }

        if (v.slice(0, 7) !== "mqtt://") {
            throw new TypeError("Needs to start with mqtt://");
        }
    },
});

convict.addFormat({
    coerce: (v: any) => {
        if (v === null) {
            return null;
        }

        return Number(v);
    },
    name: "module-address",
    validate: (v: any) => {
        if (v === null) {
            return null;
        }

        if (isNaN(v)) {
            throw new TypeError(`"${v}" Is not a valid module-address.`);
        }

        if (v < 1 || v > 82) {
            throw new TypeError("A module-address needs to be between 1 and 82");
        }
    },
});

convict.addFormat({
    name: "modules-array",
    validate: (v: any) => {
        if (!Array.isArray(v)) {
            throw new TypeError("Need to pass an array for a module-array type.");
        }

        if (v.length < 1) {
            throw new TypeError("Need to add at least 1 module in the modules-array.");
        }

        // TODO: check type if present. Can only be one of the 3 supported enum options.
    },
});

convict.addFormat({
    name: "outputs-array",
    validate: (v: any) => {
        if (!Array.isArray(v)) {
            throw new TypeError("Need to pass an array for an outputs-array type.");
        }

        if (v.length < 1) {
            throw new TypeError("Need to add at least 1 module in the outputs-array.");
        }

        if (v.some((o) => typeof o !== "string")) {
            throw new TypeError("An output should be described as a string for now.");
        }
    },
});

const CONVICT_SCHEMA = {
    dobiss: {
        host: {
            default: "192.168.0.10",
            doc: "The IP address on which the CAN Programmer is working.",
            env: "DOBISS_HOST",
            format: "ipaddress",
        },
        port: {
            default: 10001,
            doc: "The port where the CAN Programmer listens for socket communication.",
            env: "DOBISS_PORT",
            format: "port",
        },
        interface: {
            default: 'AMBIANCEPRO',
            doc: "Which protocol to talk to Dobiss. AMBIANCEPRO or SXEVOLUTION.",
            env: "DOBISS_INTERFACE",
            format: [ "AMBIANCEPRO", "SXEVOLUTION" ],
        },
    },

    modules: {
        children: {
            address: {
                default: null,
                doc: `The address of the module. From 1 to 52.
                      If not provided will take the address based on the position in the array.`,
                format: "module-address",
            },
            outputs: {
                doc: "The outputs on the module.",
                format: "outputs-array",
            },
            type: {
                default: "relay",
                doc: `The type of module it is. Depending on the module the states should be polled
                      and controlled differently.`,
                format: ["relay", "dimmer", "0-10v"],
            },
        },
        default: [],
        format: "modules-array",
    },

    mqtt: {
        url: {
            default: "mqtt://192.168.0.2",
            doc: "The URI that MQTT is operating on.",
            env: "MQTT_URL",
            format: "mqtt-locator",
        },
    },

    pollIntervalInMs: {
        default: 1000,
        doc: "How many milliseconds do we delay between every poll of every pollable module. Can also be 0.",
        env: "POLL_INTERVAL_IN_MS",
        format: "nat",
    },
};

export enum DobissInterfaceTypes {
    ambiancePro = 'AMBIANCEPRO',
    sxEvolution ='SXEVOLUTION',
}

export interface IDobissConfig {
    host: string;
    port: number;
    interface: DobissInterfaceTypes;
}

export interface IMqttConfig {
    url: string;
}

export enum ModuleType {
    relay = "relay",
    dimmer = "dimmer",
    volt = "0-10v",
}

export interface IConfigModule {
    type: ModuleType;
    address: number | null;
    outputs: string[];
}

export interface IDobiss2MqttModule {
    type: ModuleType;
    // NOTE: This is NOT index-based.
    address: number;
    outputs: IDobiss2MqttOutput[];
}

export interface IDobiss2MqttOutput {
    // NOTE: This is index-based.
    address: number;
    name: string;
}

export default class ConfigManager {

    private location: string;
    constructor(location: string) {
        this.location = location || "./data/config.js";
    }

    private get config$() {
        const config = convict(CONVICT_SCHEMA).loadFile(this.location);

        config.validate();

        // TODO: Figure out how to grab the type of Convict
        return from([ config as { get: (name: string) => any} ]);
    }

    /**
     * Exposes the relay config in a structured way.
     * multiple relays. 1 relay has multiple outputs.
     */
    public get modules$(): Observable<IDobiss2MqttModule[]> {
        return this.config$
            .pipe(
                map((config) => config.get("modules") as IConfigModule[]),
                map((modules) => {
                    return modules
                        .map((module, index) => {
                            return {
                                address: !module.address ? index + 1 : module.address,
                                outputs: module
                                    .outputs
                                    .map((name, outputIndex) => {
                                        return {
                                            address: outputIndex,
                                            name,
                                        };
                                    }),
                                type: module.type,
                            };
                        });
                }),
            );
    }

    /**
     * Exposes the CAN Programmer config.
     * This is just the host and the port.
     */
    public get dobiss$(): Observable<IDobissConfig> {
        return this.config$
            .pipe(
                map((config) => {
                    return config.get("dobiss") as IDobissConfig;
                }),
            );
    }

    /**
     * Expose the poll timeout between asking for the states for every module.
     */
    public get pollInterval$(): Observable<number> {
        return this.config$
            .pipe(
                map((config) => {
                    return config.get("pollIntervalInMs");
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
                    return config.get("mqtt") as IMqttConfig;
                }),
            );
    }

}
