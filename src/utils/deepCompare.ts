export function deepCompare (firstObject: any, secondObject: any, seen = new WeakSet()): boolean {
    if (firstObject === secondObject) {
        return true;
    }

    if (typeof firstObject === 'function' && typeof secondObject === 'function') {
        return firstObject === secondObject;
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

        if (seen.has(firstObject) || seen.has(secondObject)) {
            return true;
        }

        seen.add(firstObject);
        seen.add(secondObject);

        return firstObject.every((item, index) => deepCompare(item, secondObject[index], seen));
    }

    if (firstObject instanceof Map && secondObject instanceof Map) {
        if (firstObject.size !== secondObject.size) {
            return false;
        }

        for (const [key, value] of firstObject) {
            if (!secondObject.has(key) || !deepCompare(value, secondObject.get(key), seen)) {
                return false;
            }
        }

        return true;
    }

    if (firstObject instanceof Set && secondObject instanceof Set) {
        if (firstObject.size !== secondObject.size) {
            return false;
        }

        for (const value of firstObject) {
            if (!secondObject.has(value)) {
                return false;
            }
        }

        return true;
    }

    if (firstObject && secondObject && typeof firstObject === 'object' && typeof secondObject === 'object') {
        if (firstObject.constructor !== secondObject.constructor) {
            return false;
        }

        if (seen.has(firstObject) || seen.has(secondObject)) {
            return true;
        }

        seen.add(firstObject);
        seen.add(secondObject);

        const properties = Object.keys(firstObject);

        if (properties.length !== Object.keys(secondObject).length) {
            return false;
        }

        return properties.every((prop) => deepCompare(firstObject[prop], secondObject[prop], seen));
    }

    return false;
}
