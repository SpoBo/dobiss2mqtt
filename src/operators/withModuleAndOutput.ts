import { Observable } from "rxjs";
import { IDobiss2MqttModuleOnDobiss } from "../dobissSelector";
import { filter, map } from "rxjs/operators";
import { IDobiss2MqttOutput } from "../config";

export default function withModuleAndOutput(moduleAddress:number, outputAddress?:number) {
    return function(source$: Observable<IDobiss2MqttModuleOnDobiss>): Observable<[ IDobiss2MqttModuleOnDobiss, IDobiss2MqttOutput? ]> {
        return source$
            .pipe(
                filter(module => module.address === moduleAddress),
                map(module => {
                    if (typeof outputAddress !== 'undefined') {
                        const output = module.outputs.find(output => output.address === outputAddress)
                        if (output) {
                            return [ module, output ]
                        }
                    }

                    return [ module ]
                })
            )
    }
}
