import { IDobiss2MqttModule, IDobiss2MqttOutput, IDobissConfig, DobissInterfaceTypes } from "./config";

import { Observable } from "rxjs";

import RxSocket from "./rx-socket";

import AmbiancePRO from "./protocols/AmbiancePRO";
import SX from "./protocols/SX";
import Fake from "./protocols/Fake";

export type IOutputState = {
    output: IDobiss2MqttOutput;
    powered: boolean;
    /**
     * If the output is dimmable and dimmed this can be a specific brightness.
     */
    brightness?: number;
};

/**
 * This extends the regular module config with data specific to the current Dobiss interface.
 * For example, brightnessScale is 10 on SX while it is 100 on Ambiance.
 */
export interface IDobiss2MqttModuleOnDobiss extends IDobiss2MqttModule {
    brightnessScale?: number;
}

export interface IDobissModulesConfig {
    modules$: Observable<IDobiss2MqttModuleOnDobiss>;
}

export interface IDobissProtocol extends IDobissModulesConfig {
    // TODO: We could return null or IOutputState if the protocol immediately receives the new states.
    //       In that case we could only manually trigger the module poll if we receive null.
    //       Otherwise we assume no polling is needed.
    on: (moduleAddress: number, outputAddress: number, brightness?: number) => Observable<null>;

    off: (moduleAddress: number, outputAddress: number) => Observable<null>;

    pollModule: (moduleAddress: number) => Observable<IOutputState>;
}

export default function dobissSelector(config: IDobissConfig, socketClient: RxSocket, modules$: Observable<IDobiss2MqttModule>): IDobissProtocol {
    switch (config.interface) {
        case DobissInterfaceTypes.ambiancePro:
        case DobissInterfaceTypes.nxt:
        case DobissInterfaceTypes.evolutionPro:
            return new AmbiancePRO({ socketClient, modules$ });
        case DobissInterfaceTypes.sxAmbiance:
        case DobissInterfaceTypes.sxEvolution:
            return new SX({ socketClient, modules$ })
        case DobissInterfaceTypes.fake:
            return new Fake({ modules$ })
        default:
            throw new Error(`Interface '${config.interface}' is not supported.`)
    }
}
