const readline = require('readline');
const fetch = require('node-fetch');
const Bluebird = require('bluebird');
const Ajv = require('ajv');
fetch.Promise = Bluebird;

var headers;
var access_token;
const baseUrl = "https://platform.linked2.io/api/config/";

//Wrapper async function because we can't have async code in the top level.
(async () => {
	//Get the config data for the new integration
	const name = await askQuestion("What is the Shopify customer name ? ");
	const domain = await askQuestion("What is the Shopify domain ? ");
	const secret = await askQuestion("What is the Shopify webhook secret ? ");
	const poKey = await askQuestion("What is the PowerOffice client key ? ");

	//authenticate for access to the Linked2 API
	access_token = await authenticate();

	//Fetch your integration product list.
	var productList = await getProductList();

	console.log( "Products:")
	console.log( productList );
	console.log();
	console.log("===========================================================================");
	console.log();

	//Fetch a new stage configurator (this does not create anything it simple gets a configurator object)
	//You must provide a productId from the product list. In this case the Shopify2Go product.
		
	var stageConfigurator = await getStageConfigurator("749d0000-0194-1005-611c-08d694a6c44f");

	console.log( "Stage configurator:")
	console.log(stageConfigurator);
	console.log();
	console.log("===========================================================================");
	console.log();

	//This function also strips away the schema so we can validate the resulting object
	var configuratorOnly = configureStage( stageConfigurator, name, domain, secret, poKey );

	console.log( "Stage configurator with settings :");
	console.log(stageConfigurator);
	console.log();
	console.log("===========================================================================");
	console.log();

	var ajv = new Ajv();
	//optionally apply the schema to test for valid settings.
	var valid = ajv.validate(stageConfigurator["schema"], configuratorOnly);
	if (!valid) {
		console.log();
		console.log("===========================================================================");
		console.log();
		console.log( "Schema errors:");
		console.log(ajv.errors);
	}
	else {
		// Settings pass validation so install the staget the whole 
		//var installResults = await installStage( stageConfigurator );
		var installResults = await installStage( configuratorOnly );
	
		//Fetch the success notification using the resource url returned from the stage install.
		//Delay of 500ms just to ensure the platform has completed stage installation, this is probably unnecessary but just to be sure.
		setTimeout( async function() { var notification = await readNotification( installResults.successNotificationResource.replace("{max}", "10") );
					console.log();
					console.log("===========================================================================");
					console.log();
					console.log( notification[0].noteType );
					console.log( notification[0].message  );
				
					console.log();
					console.log("===========================================================================");
					console.log();
					console.log( "Webhook URL to copy into Shopify: " + installResults["webhookUrl"]);
					console.log()
					console.log( "All installed stage end points:");
					console.log( installResults );
				}, 500 );
	}
})();

//User input
function askQuestion(prompt) {
	const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
	});
	
	return new Promise(resolve => rl.question(prompt, ans => {
        rl.close();
        resolve(ans);
    }));
}

//Authenticate with the Linked2 platform. Request a client_id and client_secret and enter them below.
async function authenticate() {
	const credentials = {
		client_id : "",
		client_secret : "",
		audience : "https://platform.linked2.io/api",
		grant_type : "client_credentials"
	}
	
	const authHeaders = {
		"Content-Type" : "application/json"
	}

	let rawResponse = await fetch('https://linked2.eu.auth0.com/oauth/token', {
		method : "post",
		body : JSON.stringify(credentials),
		headers : authHeaders
	});
	let json = await rawResponse.json();
	
	// set the headers globally
	headers = {
		"Authorization" : "Bearer " + json.access_token,
		"Content-Type" : "application/json"
	}
	return json.access_token;
}

//Fetch a clients product list
async function getProductList() {
	let rawResponse = await fetch(baseUrl + "products", {
		method : "get",
		headers : headers
	});
	let json = await rawResponse.json();
	return json;
}

//Fetch a stage configurator
async function getStageConfigurator(productId) {
	let rawResponse = await fetch(baseUrl + "new/stage/" + productId, {
		method : "get",
		headers : headers
	});
	let json = "";
	json = await rawResponse.json();
	return json;
}

//Install a new stage
async function installStage( configurator ) {
	let rawResponse = await fetch(baseUrl + "stage", {
		method : "put",
		body : JSON.stringify( configurator ),
		headers : headers
	});
	let json = "";
	json = await rawResponse.json();
	return json;
}

//Fetch notifications of success
async function readNotification( resource ) {
	let rawResponse = await fetch(resource, {
		method : "get",
		headers : headers
	});
	let json = "";
	json = await rawResponse.json();
	return json;
}

//A simple function to set up the configurator with a ton of explanations.
function configureStage( stageConfigurator, name, domain, secret, poKey )
{
	/* Set the required stage installation settings
		a stageConfigurator comes in 6 parts:
		1) stageConfiguration. These are global stage settings.
		2) filterConfiguration. These settings for the validation of incoming data, enabling different validation for differnt end-customers.
		3) transformerConfiguration. These settings allow the transformation to be tailored for different end-customers.
		4) publishContextConfiguration. These settings enable different target accounts, emails, etc for the results to be published.
		5) supportConfiguration. Settings for the support details. Each stage may have the same or different support.
		6) schema which defines in Json Schema Draft 7 the options & settings requested in items 1 - 5.
	*/

	//stageConfiguration
	stageConfigurator["stageConfiguration"]["customerName"] = name;
	//customerIdentifier must be unique to you. This is how we track your customers usage.
	stageConfigurator["stageConfiguration"]["customerIdentifier"] = domain;
	stageConfigurator["stageConfiguration"]["secret"] = secret;
	//Filter configuration
	stageConfigurator["filterConfiguration"] = {};
	//Transformer configuration
	stageConfigurator["transformerConfiguration"] = {};
	//PublishContext configuration
	stageConfigurator["publishContextConfiguration"]["powerOfficeClientKey"] = poKey;

	//Support configuration
	stageConfigurator["supportConfiguration"]["supportContactEmail"] = "at@email.com";
	stageConfigurator["supportConfiguration"]["phone"] = "1234 552 526";
	stageConfigurator["supportConfiguration"]["primaryContact"] = "Support Person";
	//Only error notifications and above will raise a support ticket.

	return {
		stageConfiguration : stageConfigurator["stageConfiguration"],
		filterConfiguration : stageConfigurator["filterConfiguration"],
		transformerConfiguration : stageConfigurator["transformerConfiguration"],
		publishContextConfiguration : stageConfigurator["publishContextConfiguration"],
		supportConfiguration : stageConfigurator["supportConfiguration"],
	}
}
