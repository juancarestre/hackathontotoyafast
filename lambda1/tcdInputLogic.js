const AWS = require('aws-sdk')
const mockData = require("data.json")
let savedPlate

exports.handler = async (event) => {

    const dynamoDB = new AWS.DynamoDB.DocumentClient({})
    const rekognition = new AWS.Rekognition();

    const dynamoDbParams = {
        TableName: 'carsvintable'
    }

    const S3EventData = {
        Bucket: event.Records[0].s3.bucket.name,
        Key: decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, ' '))
    };

    const params = {
        Image: {
            S3Object: {
                Bucket: S3EventData.Bucket,
                Name: S3EventData.Key,
            }
        }
    }

    if (!S3EventData.Key.includes('vin')) {

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

            dynamoDbParams.IndexName = 'plate-index'
            dynamoDbParams.KeyConditionExpression = 'plate = :plate'
            dynamoDbParams.ExpressionAttributeValues = {
                ':plate': carExtractedData.plate
            }

            return dynamoDB.query(dynamoDbParams).promise()

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

            vinExtractedData.vin = res.TextDetections[26].DetectedText

            //*******************

            console.log(vinExtractedData.vin)

            await sendInfoToSocket(dynamoDB, `vin detected: ${vinExtractedData.vin}`)
            dynamoDbParams.Item = {
                plate: savedPlate,
                vin: vinExtractedData.vin
            }
            await dynamoDB.put(dynamoDbParams).promise().then(async res => {
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