import { RevertError, StringRevertError } from '@0x/utils';
import * as chai from 'chai';
import chaiAsPromised = require('chai-as-promised');
import ChaiBigNumber = require('chai-bignumber');
import * as dirtyChai from 'dirty-chai';

export const chaiSetup = {
    configure(): void {
        chai.config.includeStack = true;
        // Order matters.
        chai.use(ChaiBigNumber());
        chai.use(chaiAsPromised);
        chai.use(richRevertExtension);
        chai.use(dirtyChai);
    },
};

// tslint:disable: only-arrow-functions prefer-conditional-expression

type ChaiPromiseHandler = (x: any) => Promise<void>;
type ChaiAssertHandler = (x: any) => void;

interface Chai {
    Assertion: any;
}

interface ChaiUtils {
    flag: (assertion: any, name: string, value?: any) => any;
    overwriteMethod: (ctx: any, name: string, _super: (expected: any) => any) => void;
}

interface ChaiExtension {
    assert: ChaiAssert;
    _obj: any;
    __flags: any;
}

type ChaiAssert = (
    condition: boolean,
    failMessage?: string,
    negatedFailMessage?: string,
    expected?: any,
    actual?: any,
) => void;

function richRevertExtension(_chai: Chai, utils: ChaiUtils): void {
    utils.overwriteMethod(_chai.Assertion.prototype, 'rejectedWith', function(
        _super: ChaiPromiseHandler,
    ): ChaiPromiseHandler {
        return async function(this: ChaiExtension, expected: any): Promise<void> {
            const maybePromise = this._obj;
            // Make sure we're working with a promise.
            new _chai.Assertion().assert(maybePromise instanceof Promise, `Expected ${maybePromise} to be a promise`);
            // Wait for the promise to reject.
            let err: any;
            let didReject = false;
            try {
                await maybePromise;
            } catch (_err) {
                err = _err;
                didReject = true;
            }
            if (!didReject) {
                new _chai.Assertion().assert(false, `Expected promise to reject`);
            }
            return compareRichRevertReasons.call(this, _chai, _super, err, expected);
        };
    });
    utils.overwriteMethod(_chai.Assertion.prototype, 'become', function(
        _super: ChaiPromiseHandler,
    ): ChaiPromiseHandler {
        return async function(this: ChaiExtension, expected: any): Promise<void> {
            const maybePromise = this._obj;
            // Make sure we're working with a promise.
            new _chai.Assertion().assert(maybePromise instanceof Promise, `Expected ${maybePromise} to be a promise`);
            // Wait for the promise to resolve.
            return compareRichRevertReasons.call(this, _chai, _super, await maybePromise, expected);
        };
    });
    utils.overwriteMethod(_chai.Assertion.prototype, 'equal', function(_super: ChaiAssertHandler): ChaiAssertHandler {
        return function(this: ChaiExtension, expected: any): void {
            compareRichRevertReasons.call(this, _chai, _super, this._obj, expected);
        };
    });
    utils.overwriteMethod(_chai.Assertion.prototype, 'eql', function(_super: ChaiAssertHandler): ChaiAssertHandler {
        return function(this: ChaiExtension, expected: any): void {
            compareRichRevertReasons.call(this, _chai, _super, this._obj, expected);
        };
    });
}

function compareRichRevertReasons(
    this: ChaiExtension,
    _chai: Chai,
    _super: ChaiAssertHandler,
    _actual: any,
    _expected: any,
): void {
    let actual = _actual;
    let expected = _expected;
    // If either subject is a RevertError, try to coerce the other into the same.
    if (expected instanceof RevertError || actual instanceof RevertError) {
        // `actual` can be a RevertError, string, or an Error type.
        if (!(actual instanceof RevertError)) {
            if (typeof actual === 'string') {
                actual = new StringRevertError(actual);
            } else if (actual instanceof Error) {
                actual = new StringRevertError(actual.message);
            } else {
                new _chai.Assertion().assert(false, `Result is not of type RevertError: ${actual}`);
            }
        }
        // `expected` can be a RevertError or string.
        if (typeof expected === 'string') {
            expected = new StringRevertError(expected);
        }
    }
    if (expected instanceof RevertError && actual instanceof RevertError) {
        // Check for equality.
        this.assert(
            actual.equals(expected),
            `${actual.toString()} != ${expected.toString()}`,
            `${actual.toString()} == ${expected.toString()}`,
            expected,
            actual,
        );
        return;
    }
    _super.call(this, _expected);
}
