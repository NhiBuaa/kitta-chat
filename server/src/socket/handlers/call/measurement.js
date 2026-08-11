const noopCompletion = Object.freeze({
    finish() {},
    abandon() {},
});

const beginCallMeasurement = (measurement, phase, stage) => {
    try {
        const completion = measurement?.beginCallStage?.(phase, stage);
        if (typeof completion?.finish !== "function") return noopCompletion;
        return completion;
    } catch (error) {
        return noopCompletion;
    }
};

const finishCallMeasurement = (completion, outcome) => {
    try {
        completion.finish(outcome);
    } catch (error) {
        // Measurement is strictly fail-inert to the call flow.
    }
};

const abandonCallMeasurement = (completion) => {
    try {
        completion.abandon?.();
    } catch (error) {
        // Measurement is strictly fail-inert to the call flow.
    }
};

module.exports = {
    abandonCallMeasurement,
    beginCallMeasurement,
    finishCallMeasurement,
};
