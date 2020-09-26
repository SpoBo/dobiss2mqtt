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
    mergeMap,
    map,
    switchMap
} from "rxjs/operators";
import withModuleAndOutput from "../operators/withModuleAndOutput";

enum ACTION_TYPES {
    toggle = 0x02,
    on = 0x01,
    off = 0x00,
}

type ModuleState = {
   powered: boolean;
   level?: number;
}

/**
 * It's useful to configure a Fake dobiss instance. Especially when you want to test hardware you don't have.
 * It will basically pretend to be real hardware and store requested statechanges internally.
 * When polling the interface it will return whatever is saved.
 */
export default class Fake implements IDobissProtocol {
    private _modules$: Observable<IDobiss2MqttModule>;

    private states: Map<string, ModuleState>

    constructor({ modules$ }: { modules$: Observable<IDobiss2MqttModule> }) {
        this._modules$ = modules$;
        this.states = new Map()
    }

    public off (moduleAddress: number, outputAddress: number): Observable<null> {
        return this.modules$
            .pipe(
                withModuleAndOutput(moduleAddress, outputAddress),
                switchMap(([ module, output ]) => {
                    if (output) {
                        return this.setState(module, output, ACTION_TYPES.off);
                    }

                    return empty()
                })
            )
    }

    public on (moduleAddress: number, outputAddress: number, level?: number): Observable<null> {
        console.log('setting', { moduleAddress, outputAddress, level })
        return this.modules$
            .pipe(
                withModuleAndOutput(moduleAddress, outputAddress),
                switchMap(([ module, output ]) => {
                    if (output) {
                        return this.setState(module, output, ACTION_TYPES.on, level);
                    }

                    return empty()
                })
            )
    }

    public pollModule (moduleAddress: number): Observable<IOutputState> {
        return this.modules$
            .pipe(
                withModuleAndOutput(moduleAddress),
                switchMap(([ module ]) => {
                    if (module.address !== moduleAddress) {
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
                                    result.level = state?.level
                                }

                                return of(result)
                            }),
                        )
                }),

            )
    }

    get modules$(): Observable<IDobiss2MqttModule> {
        return this._modules$
            .pipe(
                map((module) => {
                    if (module.type === 'dimmer') {
                        return {
                            ...module,
                            brightnessScale: 10
                        };
                    }

                    return module;
                })
            )
    }

    private setState (module: IDobiss2MqttModule, output: IDobiss2MqttOutput, actionType: number, level?: number): Observable<null> {
        const key = `${module.address}_${output.address}`;
        const value = { powered: actionType === ACTION_TYPES.on, level: actionType === ACTION_TYPES.on ? level ?? 100 : 0 };
        this.states.set(key, value)
        return of(null)
    }
}
