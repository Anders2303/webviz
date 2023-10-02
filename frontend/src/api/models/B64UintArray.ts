/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */

export type B64UintArray = {
    element_type: B64UintArray.element_type;
    data_b64str: string;
};

export namespace B64UintArray {

    export enum element_type {
        UINT16 = 'uint16',
        UINT32 = 'uint32',
        UINT64 = 'uint64',
    }


}

