const {setGlobalOptions} = require("firebase-functions");

// Limit the number of concurrent containers to control costs.
setGlobalOptions({maxInstances: 10});

