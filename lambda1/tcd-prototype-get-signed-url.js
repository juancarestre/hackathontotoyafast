/**
 *
 * Event doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format
 * @param {Object} event - API Gateway Lambda Proxy Input Format
 *
 * Context doc: https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-context.html
 * @param {Object} context
 *
 * Return doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html
 * @returns {Object} object - API Gateway Lambda Proxy Output Format
 *
 */

// const connectToDatabase = require('/opt/nodejs/src/associations') // initialize connection

const AWS = require('aws-sdk')
const crypto = require("crypto")

const options = {
    signatureVersion: 'v4'
}

//* *  */
exports.handler = async (event, context) => {
    const s3 = new AWS.S3(options)
    console.log(JSON.stringify(event))
    const Id = crypto.randomBytes(16).toString('hex')

    const fileName = `${Id}.png`
    const path = event.queryStringParameters.path === 'vin' ? 'statics/vin' : 'statics/img'
    const objectKey = `${path}/${fileName}`

    const signedUrl = await s3.getSignedUrlPromise('putObject', {
        Bucket: 'toyotacoins',
        Key: objectKey,
        Expires: 4000
    })

    return {
            statusCode: 200,
            headers: {"content-type": "application/json"},
            body: JSON.stringify({
                signedUrl
            }),
        };
}
