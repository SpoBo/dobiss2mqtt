import { IDobiss2MqttModule, IDobiss2MqttOutput, IDobissConfig, DobissInterfaceTypes } from "./config";

import { Observable } from "rxjs";

import RxSocket from "./rx-socket";

import AmbiancePRO from "./protocols/AmbiancePRO";
import SX from "./protocols/SX";

export type IOutputState = {
    output: IDobiss2MqttOutput;
    powered: boolean;
    /**
     * If the output is dimmable and dimmed this can be a specific brightness.
     */
    brightness?: number;
};

export interface IDobissProtocol {

    // TODO: We could return null or IOutputState if the protocol immediately receives the new states.
    //       In that case we could only manually trigger the module poll if we receive null.
    //       Otherwise we assume no polling is needed.
    on: (module: IDobiss2MqttModule, output: IDobiss2MqttOutput) => Observable<null>;

    off: (module: IDobiss2MqttModule, output: IDobiss2MqttOutput) => Observable<null>;

    dim?: (module: IDobiss2MqttModule, output: IDobiss2MqttOutput, brightess: number) => Observable<null>;

    pollModule: (module: IDobiss2MqttModule) => Observable<IOutputState>;

}

export default function dobissSelector(config: IDobissConfig, socketClient: RxSocket): IDobissProtocol {
    if (config.interface === DobissInterfaceTypes.sxEvolution) {
        return new SX({ socketClient })
    }

    return new AmbiancePRO({ socketClient });
}
