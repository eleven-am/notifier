import { deepCompare } from './deepCompare';

describe('deepCompare', () => {
    describe('primitives', () => {
        it('should return true for equal primitives', () => {
            expect(deepCompare(1, 1)).toBe(true);
            expect(deepCompare('hello', 'hello')).toBe(true);
            expect(deepCompare(true, true)).toBe(true);
            expect(deepCompare(null, null)).toBe(true);
            expect(deepCompare(undefined, undefined)).toBe(true);
        });

        it('should return false for unequal primitives', () => {
            expect(deepCompare(1, 2)).toBe(false);
            expect(deepCompare('hello', 'world')).toBe(false);
            expect(deepCompare(true, false)).toBe(false);
            expect(deepCompare(null, undefined)).toBe(false);
        });
    });

    describe('functions', () => {
        it('should return true for same function reference', () => {
            const fn = () => {};

            expect(deepCompare(fn, fn)).toBe(true);
        });

        it('should return false for different functions', () => {
            const fn1 = () => {};
            const fn2 = () => {};

            expect(deepCompare(fn1, fn2)).toBe(false);
        });
    });

    describe('dates', () => {
        it('should return true for equal dates', () => {
            const date1 = new Date('2024-01-01');
            const date2 = new Date('2024-01-01');

            expect(deepCompare(date1, date2)).toBe(true);
        });

        it('should return false for unequal dates', () => {
            const date1 = new Date('2024-01-01');
            const date2 = new Date('2024-01-02');

            expect(deepCompare(date1, date2)).toBe(false);
        });
    });

    describe('regular expressions', () => {
        it('should return true for equal regexes', () => {
            expect(deepCompare(/test/gi, /test/gi)).toBe(true);
        });

        it('should return false for regexes with different patterns', () => {
            expect(deepCompare(/test/, /test2/)).toBe(false);
        });

        it('should return false for regexes with different flags', () => {
            expect(deepCompare(/test/g, /test/i)).toBe(false);
        });
    });

    describe('arrays', () => {
        it('should return true for equal arrays', () => {
            expect(deepCompare([1, 2, 3], [1, 2, 3])).toBe(true);
            expect(deepCompare(['a', 'b'], ['a', 'b'])).toBe(true);
        });

        it('should return false for arrays with different lengths', () => {
            expect(deepCompare([1, 2], [1, 2, 3])).toBe(false);
        });

        it('should return false for arrays with different values', () => {
            expect(deepCompare([1, 2, 3], [1, 2, 4])).toBe(false);
        });

        it('should deep compare nested arrays', () => {
            expect(deepCompare([[1, 2], [3, 4]], [[1, 2], [3, 4]])).toBe(true);
            expect(deepCompare([[1, 2], [3, 4]], [[1, 2], [3, 5]])).toBe(false);
        });
    });

    describe('maps', () => {
        it('should return true for equal maps', () => {
            const map1 = new Map([['a', 1], ['b', 2]]);
            const map2 = new Map([['a', 1], ['b', 2]]);

            expect(deepCompare(map1, map2)).toBe(true);
        });

        it('should return false for maps with different sizes', () => {
            const map1 = new Map([['a', 1]]);
            const map2 = new Map([['a', 1], ['b', 2]]);

            expect(deepCompare(map1, map2)).toBe(false);
        });

        it('should return false for maps with different values', () => {
            const map1 = new Map([['a', 1]]);
            const map2 = new Map([['a', 2]]);

            expect(deepCompare(map1, map2)).toBe(false);
        });

        it('should deep compare map values', () => {
            const map1 = new Map([['a', { x: 1 }]]);
            const map2 = new Map([['a', { x: 1 }]]);

            expect(deepCompare(map1, map2)).toBe(true);
        });
    });

    describe('sets', () => {
        it('should return true for equal sets', () => {
            const set1 = new Set([1, 2, 3]);
            const set2 = new Set([1, 2, 3]);

            expect(deepCompare(set1, set2)).toBe(true);
        });

        it('should return false for sets with different sizes', () => {
            const set1 = new Set([1, 2]);
            const set2 = new Set([1, 2, 3]);

            expect(deepCompare(set1, set2)).toBe(false);
        });

        it('should return false for sets with different values', () => {
            const set1 = new Set([1, 2, 3]);
            const set2 = new Set([1, 2, 4]);

            expect(deepCompare(set1, set2)).toBe(false);
        });

        it('should compare set items deeply', () => {
            const set1 = new Set([{ id: 1 }, { id: 2 }]);
            const set2 = new Set([{ id: 2 }, { id: 1 }]);

            expect(deepCompare(set1, set2)).toBe(true);
        });

        it('should match each set item at most once', () => {
            const set1 = new Set([{ id: 1 }, { id: 1 }]);
            const set2 = new Set([{ id: 1 }, { id: 2 }]);

            expect(deepCompare(set1, set2)).toBe(false);
        });

        it('should return false when a set item has no deep match', () => {
            const set1 = new Set([1, { id: 1 }]);
            const set2 = new Set([1, { id: 3 }]);

            expect(deepCompare(set1, set2)).toBe(false);
        });
    });

    describe('objects', () => {
        it('should return true for equal objects', () => {
            expect(deepCompare({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
        });

        it('should return false for objects with different keys', () => {
            expect(deepCompare({ a: 1 }, { b: 1 })).toBe(false);
        });

        it('should return false for objects with different values', () => {
            expect(deepCompare({ a: 1 }, { a: 2 })).toBe(false);
        });

        it('should return false for objects with different number of keys', () => {
            expect(deepCompare({ a: 1 }, { a: 1, b: 2 })).toBe(false);
        });

        it('should deep compare nested objects', () => {
            const obj1 = { a: { b: { c: 1 } } };
            const obj2 = { a: { b: { c: 1 } } };
            const obj3 = { a: { b: { c: 2 } } };

            expect(deepCompare(obj1, obj2)).toBe(true);
            expect(deepCompare(obj1, obj3)).toBe(false);
        });

        it('should return false for objects with different constructors', () => {
            class Foo {
                x = 1;
            }

            class Bar {
                x = 1;
            }

            expect(deepCompare(new Foo(), new Bar())).toBe(false);
        });
    });

    describe('circular references', () => {
        it('should handle circular references in objects', () => {
            const obj1: any = { a: 1 };

            obj1.self = obj1;

            const obj2: any = { a: 1 };

            obj2.self = obj2;

            expect(deepCompare(obj1, obj2)).toBe(true);
        });

        it('should handle circular references in arrays', () => {
            const arr1: any[] = [1, 2];

            arr1.push(arr1);

            const arr2: any[] = [1, 2];

            arr2.push(arr2);

            expect(deepCompare(arr1, arr2)).toBe(true);
        });

        it('should not treat a previously visited object as equal to a different object', () => {
            const first = {
                primary: { value: 1 },
                secondary: { value: 2 },
            };
            const shared = { value: 1 };
            const second = {
                primary: shared,
                secondary: shared,
            };

            expect(deepCompare(first, second)).toBe(false);
        });

        it('should compare one shared object against multiple matching objects', () => {
            const shared = { value: 1 };
            const first = { primary: shared, secondary: shared };
            const second = {
                primary: { value: 1 },
                secondary: { value: 1 },
            };

            expect(deepCompare(first, second)).toBe(true);
        });

        it('should handle circular map values', () => {
            const first = new Map<string, unknown>();
            const second = new Map<string, unknown>();

            first.set('self', first);
            second.set('self', second);

            expect(deepCompare(first, second)).toBe(true);
        });

        it('should handle a set that contains an object pointing back to it', () => {
            const first = new Set<unknown>();
            const second = new Set<unknown>();

            first.add({ owner: first });
            second.add({ owner: second });

            expect(deepCompare(first, second)).toBe(true);
        });

        it('should compare a shared deep object against separate equal copies', () => {
            const nest = (depth: number, leaf: unknown): unknown => (depth === 0 ? leaf : { child: nest(depth - 1, leaf) });
            const shared = { value: 1 };

            const first = nest(80, { left: shared, right: shared });
            const second = nest(80, { left: { value: 1 }, right: { value: 1 } });
            const different = nest(80, { left: { value: 1 }, right: { value: 2 } });

            expect(deepCompare(first, second)).toBe(true);
            expect(deepCompare(first, different)).toBe(false);
        });

        it('should compare a branching tree with parent back-pointers quickly', () => {
            interface TreeNode { id: number; parent: TreeNode | null; children: TreeNode[] }

            const build = (): TreeNode => {
                let id = 0;
                const grow = (parent: TreeNode | null, depth: number): TreeNode => {
                    const node: TreeNode = { id: id++, parent, children: [] };

                    if (depth > 0) {
                        for (let i = 0; i < 2; i++) {
                            node.children.push(grow(node, depth - 1));
                        }
                    }

                    return node;
                };

                return grow(null, 2);
            };

            const started = Date.now();

            expect(deepCompare(build(), build())).toBe(true);
            expect(Date.now() - started).toBeLessThan(50);
        });

        it('should tell apart circular structures that differ', () => {
            const first: Record<string, unknown> = { value: 1 };
            const second: Record<string, unknown> = { value: 2 };

            first.self = first;
            second.self = second;

            expect(deepCompare(first, second)).toBe(false);
        });
    });

    describe('mixed types', () => {
        it('should return false when comparing different types', () => {
            expect(deepCompare({}, [])).toBe(false);
            expect(deepCompare([], {})).toBe(false);
            expect(deepCompare(1, '1')).toBe(false);
            expect(deepCompare(null, {})).toBe(false);
        });
    });
});
