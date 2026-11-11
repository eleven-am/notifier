type SeenPairs = WeakMap<object, WeakSet<object>>;

interface Visit {
    seen: SeenPairs | null;
    objects: number;
}

const REMEMBER_PAIRS_AFTER = 64;

function hasSeenPair (firstObject: object, secondObject: object, visit: Visit): boolean {
    if (visit.seen === null) {
        visit.seen = new WeakMap();
    }

    const { seen } = visit;
    const matches = seen.get(firstObject);

    if (matches?.has(secondObject)) {
        return true;
    }

    if (matches) {
        matches.add(secondObject);
    } else {
        seen.set(firstObject, new WeakSet([secondObject]));
    }

    return false;
}

function remembered (firstObject: object, secondObject: object, visit: Visit): boolean {
    visit.objects += 1;

    return visit.objects > REMEMBER_PAIRS_AFTER && hasSeenPair(firstObject, secondObject, visit);
}

function setsMatch (firstSet: Set<unknown>, secondSet: Set<unknown>, visit: Visit): boolean {
    let unmatched: unknown[] | null = null;

    for (const value of firstSet) {
        if (secondSet.has(value)) {
            continue;
        }

        if (unmatched === null) {
            unmatched = Array.from(secondSet).filter((candidate) => !firstSet.has(candidate));
        }

        const index = unmatched.findIndex((candidate) => compare(value, candidate, visit)); // eslint-disable-line @typescript-eslint/no-use-before-define

        if (index === -1) {
            return false;
        }

        unmatched.splice(index, 1);
    }

    return true;
}

function compare (firstObject: any, secondObject: any, visit: Visit): boolean {
    if (firstObject === secondObject) {
        return true;
    }

    if (typeof firstObject !== 'object' || typeof secondObject !== 'object' || firstObject === null || secondObject === null) {
        return false;
    }

    if (firstObject instanceof Date && secondObject instanceof Date) {
        return firstObject.getTime() === secondObject.getTime();
    }

    if (firstObject instanceof RegExp && secondObject instanceof RegExp) {
        return firstObject.source === secondObject.source && firstObject.flags === secondObject.flags;
    }

    if (Array.isArray(firstObject) && Array.isArray(secondObject)) {
        if (firstObject.length !== secondObject.length) {
            return false;
        }

        if (remembered(firstObject, secondObject, visit)) {
            return true;
        }

        return firstObject.every((item, index) => compare(item, secondObject[index], visit));
    }

    if (firstObject instanceof Map && secondObject instanceof Map) {
        if (firstObject.size !== secondObject.size) {
            return false;
        }

        if (remembered(firstObject, secondObject, visit)) {
            return true;
        }

        for (const [key, value] of firstObject) {
            if (!secondObject.has(key) || !compare(value, secondObject.get(key), visit)) {
                return false;
            }
        }

        return true;
    }

    if (firstObject instanceof Set && secondObject instanceof Set) {
        if (firstObject.size !== secondObject.size) {
            return false;
        }

        if (remembered(firstObject, secondObject, visit)) {
            return true;
        }

        return setsMatch(firstObject, secondObject, visit);
    }

    if (firstObject.constructor !== secondObject.constructor) {
        return false;
    }

    if (remembered(firstObject, secondObject, visit)) {
        return true;
    }

    const properties = Object.keys(firstObject);

    if (properties.length !== Object.keys(secondObject).length) {
        return false;
    }

    return properties.every((prop) => compare(firstObject[prop], secondObject[prop], visit));
}

/**
 * Structural equality used to skip updates whose value did not change: compares primitives,
 * arrays, plain objects, Maps (keys by identity), Sets (items deeply), Dates and RegExps,
 * and handles circular references.
 */
export function deepCompare (firstObject: unknown, secondObject: unknown): boolean {
    return compare(firstObject, secondObject, {
        seen: null,
        objects: 0,
    });
}
