const AWS = require('aws-sdk')
const mockData = require("data.json")
let savedPlate

exports.handler = async (event) => {

    const dynamoDB = new AWS.DynamoDB.DocumentClient({})
    const rekognition = new AWS.Rekognition();
    const s3 = new AWS.S3()

    const dynamodbparams = {
        TableName: 'carsvintable'
    }

    let getParams = {
        Bucket: event.Records[0].s3.bucket.name,
        Key: decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '))
    };

    const params = {
        Image: {
            S3Object: {
                Bucket: getParams.Bucket,
                Name: getParams.Key,
            }
        }
    }

    if (!getParams.Key.includes('vin')) {

        await sendInfoToSocket(dynamoDB, `Your car picture was uploaded succesfully`)

        const carExtractedData = {}

        return rekognition.detectText(params).promise().then(async res => {
            console.log('image text')
            console.log(res)

            carExtractedData.plate = res.TextDetections[1].DetectedText

            //*******************

            console.log(carExtractedData.plate)

            await sendInfoToSocket(dynamoDB, `cart plate detected: ${carExtractedData.plate}`)
            await sendInfoToSocket(dynamoDB, `searching if your car is already registered...`)


            //*******************

            dynamodbparams.IndexName = 'plate-index'
            dynamodbparams.KeyConditionExpression = 'plate = :plate'
            dynamodbparams.ExpressionAttributeValues = {
                ':plate': carExtractedData.plate
            }

            return dynamoDB.query(dynamodbparams).promise()

        }).then(async result => {

            if (result.Items.length === 0) {
                carExtractedData.registered = false
                savedPlate = carExtractedData.plate
                await sendInfoToSocket(dynamoDB, `your car is not in our database, take picture of bin to register`)

            } else {
                carExtractedData.registered = true
                await sendInfoToSocket(dynamoDB, `car is already registered: ${JSON.stringify(result.Items[0])}`)
                await sendInfoToSocket(dynamoDB, `getting data from transit...`)
                let transitData = fetchData(result.Items[0].vin)
                await sendInfoToSocket(dynamoDB, `transit data: ${JSON.stringify(transitData)}`)

            }
            console.log(result.Items)
            console.log(carExtractedData)
            return carExtractedData
        }).catch(e => {
            console.log(e)
            return false
        })


    } else {
        await sendInfoToSocket(dynamoDB, `Your vin picture was uploaded succesfully`)

        const vinExtractedData = {}

        return rekognition.detectText(params).promise().then(async res => {
            console.log('image text')
            console.log(res)

            // vinExtractedData.vin = res.TextDetections[26].DetectedText

            vinExtractedData.vin = vin_finder(res.TextDetections)

            //*******************

            console.log(vinExtractedData.vin)

            await sendInfoToSocket(dynamoDB, `vin detected: ${vinExtractedData.vin}`)
            dynamodbparams.Item = {
                plate: savedPlate,
                vin: vinExtractedData.vin
            }
            await dynamoDB.put(dynamodbparams).promise().then(async res => {
                await sendInfoToSocket(dynamoDB, `attached vin: ${vinExtractedData.vin} with plate: ${savedPlate}`)
                savedPlate = ''
                await sendInfoToSocket(dynamoDB, `getting data from transit...`)
                let transitData = fetchData(vinExtractedData.vin)
                await sendInfoToSocket(dynamoDB, `transit data: ${JSON.stringify(transitData)}`)
            })
        })


    }


};


const fetchData = (vin) => {
    let value = require('crypto').createHash('md5').update(vin).digest('hex')
    let hashed = (parseInt(value, 16)).toString().slice(0, 1)
    console.log(hashed)
    let carData = mockData[`${hashed}`]
    return carData

}

const sendInfoToSocket = async (dynamoDB, info) => {

    const apigatewaymanagementapi = new AWS.ApiGatewayManagementApi({
        endpoint: `https://tol3bxt5gl.execute-api.us-east-1.amazonaws.com/l`
    })
    await dynamoDB.scan({
        TableName: 'putsomethinginsqs-socket'
    }).promise().then(res => {
        console.log('sending messages to:', res.Items)
        return Promise.all(res.Items.map(ids => apigatewaymanagementapi.postToConnection({
            Data: info,
            ConnectionId: ids.connectionId
        }).promise()))
    })
}


function vin_finder(TextDetections) {
    for (i = 0; i < TextDetections.length; i++) {
        if (TextDetections[i].Type == 'WORD' && TextDetections[i].DetectedText.length == 17) {
            return TextDetections[i].DetectedText;
        }
    }
}  