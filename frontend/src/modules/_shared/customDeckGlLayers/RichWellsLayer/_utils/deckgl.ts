import type { Accessor, AccessorContext } from "@deck.gl/core";

// Deck.gl guarantees that the "Out" type is never be a function.
type NotAFunction = object | string | number | boolean | null | undefined;

export function getWithAccessor<In, Out extends NotAFunction>(
    accessor: Accessor<In, Out>,
    data: In,
    objectInfo: AccessorContext<In>,
): Out {
    if (typeof accessor === "function") {
        return accessor(data, objectInfo);
    }

    return accessor;
}

// In some cases, deck.gl uses logic similar to accessors, but without the added object info
export function getWithAccessorLike<In, Out extends NotAFunction>(
    accessor: Out | ((input: In) => Out),
    input: In,
): Out {
    if (typeof accessor === "function") {
        return accessor(input);
    }
    return accessor;
}
