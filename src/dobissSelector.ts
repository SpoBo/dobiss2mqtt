import { IDobiss2MqttModule, IDobiss2MqttOutput, IDobissConfig } from "./config";

import { Observable } from "rxjs";
import AmbiancePRO from "./protocols/AmbiancePRO";
import SocketClient from "./rx-socket";

export type IOutputState = {
    output: IDobiss2MqttOutput;
    powered: boolean;
    /**
     * If the output is dimmable and dimmed this can be a specific brightness.
     */
    brightness?: number;
};

export interface IDobissProtocol {

    on: (module: IDobiss2MqttModule, output: IDobiss2MqttOutput) => Observable<null>;

    off: (module: IDobiss2MqttModule, output: IDobiss2MqttOutput) => Observable<null>;

    dim?: (module: IDobiss2MqttModule, output: IDobiss2MqttOutput, brightess: number) => Observable<null>;

    pollModule: (module: IDobiss2MqttModule) => Observable<IOutputState>;

}

export default function dobissSelector(config: IDobissConfig, socketClient: SocketClient): IDobissProtocol {
    // TODO: In the future, depending on your config, select the correct Dobiss protocol.
    return new AmbiancePRO({ socketClient });
}
