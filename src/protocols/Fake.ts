import {
    Observable,
    of,
    from,
    empty,
} from "rxjs";

import {
    IDobiss2MqttModule,
    IDobiss2MqttOutput,
} from "../config";

import {
    IDobissProtocol,
    IOutputState,
} from "../dobissSelector";

import {
    mergeMap
} from "rxjs/operators";

enum ACTION_TYPES {
    toggle = 0x02,
    on = 0x01,
    off = 0x00,
}

type ModuleState = {
   powered: boolean,
   brightness?: number
}

/**
 * It's useful to configure a Fake dobiss instance. Especially when you want to test hardware you don't have.
 * It will basically pretend to be real hardware and store requested statechanges internally.
 * When polling the interface it will return whatever is saved.
 */
export default class Fake implements IDobissProtocol {
    private modules$: Observable<IDobiss2MqttModule[]>;

    private states: Map<string, ModuleState>

    constructor({ modules$ }: { modules$: Observable<IDobiss2MqttModule[]> }) {
        this.modules$ = modules$;
        this.states = new Map()
    }

    public off (module: IDobiss2MqttModule, output: IDobiss2MqttOutput): Observable<null> {
        return this.setState(module, output, ACTION_TYPES.off);
    }

    public on (module: IDobiss2MqttModule, output: IDobiss2MqttOutput, brightness?: number): Observable<null> {
        return this.setState(module, output, ACTION_TYPES.on, brightness);
    }

    public pollModule (module: IDobiss2MqttModule): Observable<IOutputState> {
        return this.modules$
            .pipe(
                mergeMap(modules => {
                    return from(modules)
                        .pipe(
                            mergeMap(currentModule => {
                                if (currentModule.address !== module.address) {
                                    return empty();
                                }

                                return from(module.outputs)
                                    .pipe(
                                        mergeMap(output => {
                                            const key = `${module.address}_${output.address}`
                                            const state = this.states.get(key)

                                            const result: IOutputState = {
                                                output,
                                                powered: !!(state?.powered),
                                            }


                                            if (output.dimmable) {
                                                result.brightness = state?.brightness
                                            }

                                            return of(result)
                                        }),
                                    )
                            }),
                        )
                })
            )
    }

    private setState (module: IDobiss2MqttModule, output: IDobiss2MqttOutput, actionType: number, brightness?: number): Observable<null> {
        const key = `${module.address}_${output.address}`;
        const value = { powered: actionType === ACTION_TYPES.on, brightness: actionType === ACTION_TYPES.on ? brightness ?? 100 : 0 };
        this.states.set(key, value)
        return of(null)
    }
}
