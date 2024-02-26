const axios = require('axios');
// const AWS = require('aws-sdk');
const express = require('express');
const bodyParser = require("body-parser");
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3004;

const access_token = process.env.CANVAS_ACCESS_TOKEN;
const monday_api_key = process.env.MONDAY_API_KEY;
const base_url = "https://usu.instructure.com/api/v1";

app.use(bodyParser.json()); //Handles JSON requests
app.use(bodyParser.urlencoded({extended:true}));

function getNextPageUrl(linkHeader) {
    try {
      console.log("---- changing to next page ----")
      const links = linkHeader.split(',');
      for (const link of links) {
          const [url, rel] = link.split('; ');
          if (rel.includes('next')) {
              return url.slice(1, -1); // Remove angle brackets around URL
          }
      }
      return null; // No next page link
    }
    catch(err){
      console.log(err)
    }
}

async function getInstructorName(courseId) {
    const headers = {
        "Authorization": `Bearer ${access_token}`
    };

    const params = {
        "per_page": 500  // Number of pages to retrieve per request
    };

    const allDiscussions = [];
    let url = `${base_url}/courses/${courseId}/search_users?enrollment_type=teacher`;

    while (url) {
        try {
            const response = await axios.get(url, {
                headers: headers,
                params: params
            });

            const pages = response.data;
            allDiscussions.push(...pages);

            // Check if there are more pages
            const nextPageUrl = getNextPageUrl(response.headers.link);
            if (nextPageUrl) {
                url = nextPageUrl;
            } else {
                break; // No more pages
            }
        } catch (error) {
            console.error(`Error fetching: ${error}`);
            break;
        }
    }

    return allDiscussions[0].name;
}


function uploadFileToS3(bucket_name, file_key, data_dict, s3_client) {
    const params = {
        Bucket: bucket_name,
        Key: file_key,
        Body: JSON.stringify(data_dict),
    };

    return s3_client.putObject(params).promise();
}

async function addOrGetValuesOfBoard(action) {
    try {
        const url = "https://api.monday.com/v2";
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': monday_api_key
        };

        const data = {
            'query': action
        };

        // return axios.post(url, data, { headers })
        //     .then(response => response.data)
        //     .catch(error => {
        //         console.error(error);
        //         throw error;
        //     });

        let response = await axios.post(url, data, { headers });
        let all_items = response.data;
        let res_data = all_items['data'];

        console.log(res_data)
        if('boards' in res_data ){
            // Accumulate all items into a list
            all_items = all_items['data']['boards'][0]['items_page']['items'];
            let cursor = all_items['data']['boards'][0]['items_page']['cursor'];

            // Continue paginating until there are no more items
            while (cursor) {
                let query = `
                    query {
                        next_items_page(limit:500, cursor:"${cursor}") {
                            cursor
                            items {
                                id
                                name
                                column_values {
                                    id
                                    column {
                                        id
                                        title
                                    }
                                    value
                                }
                            }
                        }
                    }
                `;

                data = { 'query': query };
                response = await axios.post(url, data, { headers });
                let res = response.data;

                // Append items to the list
                all_items = all_items.concat(res["data"]["next_items_page"]["items"]);
                cursor = res["data"]["next_items_page"]['cursor'];
                console.log(all_items.length);
            }
        }

        return all_items;
    }
    catch(error){
        console.log(error)
    }
}

function makePostRequestToAltText(courseId, courseIsPriority) {
    try {
        const url = "http://applications.accessapps.link:3003/load_images";
        // const url = "https://6f94-139-64-171-69.ngrok-free.app/load_images";
        const headers = {
            'Content-Type': 'application/json'
        };

        const data = {
            'course_id': courseId,
            'is_priority': courseIsPriority,
            'oauth_consumer_key': access_token,
            'monday_load': true
        };

        return axios.post(url, data, { headers })
            .then(response => response.data)
            .catch(error => {
                console.error(error);
                throw error;
            });
    }
    catch(error){
        console.log(error)
    }
}

async function resetAllTheUsers() {
    try {
        const url = "https://accessibility.accessapps.link/reset_users";
        const headers = {
            'Content-Type': 'application/json'
        };

        const data = {
            'oauth_consumer_key': access_token
        };

        return new Promise(function(resolve, reject){
                axios.post(url, data, { headers })
                .then(response => {
                    console.log(response.data);
                    resolve(response.data);
                })
                .catch(error => {
                    console.log(error);
                    reject(error);
                });
            })
    }
    catch(error){
        console.log(error)
    }
}

function isBase64Encoded(s) {
    try {
        const decoded_data = Buffer.from(s, 'base64').toString('utf-8');
        const reencoded_data = Buffer.from(decoded_data, 'utf-8').toString('base64');
        return reencoded_data === s;
    } catch (error) {
        return false;
    }
}

async function postMethodHandler(event) {
    return event.body;
}

async function manageUnusableImage(req) {
    try {
        const column_value = {
            "text": `https://usu.instructure.com/${req["canvas_page"]}`,
            "text56": req["course_name"],
            'text94': await getInstructorName(req['course_id'])
        };
        console.log("check 5")
        console.log(column_value);
        const addNewURLDataQuery = `mutation {
            create_item (board_id: 5241649933, group_id: "topics", item_name: ${JSON.stringify(req["image_name"])}, column_values: ${JSON.stringify(JSON.stringify(column_value))}) {
                id
            }
        }`;

        console.log(addNewURLDataQuery);

        const res = await addOrGetValuesOfBoard(addNewURLDataQuery);
        return res;
    }
    catch(error){
        console.log(error)
    }
}

async function updateAccesibleImages(req) {
    try{
        const column_value = {
            "status": "Loaded",
            "__of_images": req['images_added']
        };

        const addNewURLDataQuery = `mutation {
            change_multiple_column_values (board_id: 1206883120, item_id: ${item_id}, column_values:${JSON.stringify(JSON.stringify(column_value))} ) {
                id
            }
        }`;

        const res = await addOrGetValuesOfBoard(addNewURLDataQuery);
        return res;
    }
    catch(error){
        console.log(error)
    }
}

async function getMethodHandler(req) {
    try {
        const item_id = req["event"]["pulseId"];
        const column_title = req["event"]["columnTitle"];
        let column_value = req["event"]["value"]["label"]["text"];

        if (!(column_value === "Load Images w/Prioritiy" || column_value === "Load Images Standard")) {
            return {
                'statusCode': 200,
                'body': JSON.stringify("Not a valid request")
            };
        }

        const getBoardDataQuery = `query{
                                        items (ids:${item_id}){
                                            id
                                            name
                                            column_values{
                                                id
                                                column {
                                                    id
                                                    title
                                                }
                                                value
                                                text
                                            }
                                        }
                                    }`;

        const rowData = await addOrGetValuesOfBoard(getBoardDataQuery);
        console.log(rowData);
        const items = rowData["data"]["items"]
        let url = '';

        for (const item of items) {
            const column_values = item['column_values'];
            for (const obj of column_values) {
                if (obj['column']['title'] === "Course URL") {
                    url = obj['text'];
                    break;
                }
            }
            if (url) {
                break;
            }
        }

        let course_number = 0;
        const match = url.match(/\/courses\/(\d+)/);

        if (match) {
            course_number = match[1];
        }

        const altTextResponse = await makePostRequestToAltText(course_number, column_value === "Load Images w/Prioritiy");

        console.log(altTextResponse);
        console.log("hello")
        const response = altTextResponse;

        if (!('error' in response)) {
            column_value = {
                "status": "Loaded",
                "__of_images": response['images_added']
            };
        } else {
            column_value = {
                "status": "Error",
                "__of_images": 0
            };
        }

        console.log(column_value);

        const addNewURLDataQuery = `mutation {
            change_multiple_column_values (board_id: 1206883120, item_id: ${item_id}, column_values:${JSON.stringify(JSON.stringify(column_value))} ) {
                id
            }
        }`;

        await addOrGetValuesOfBoard(addNewURLDataQuery);
    }
    catch(error){
        console.log(error)
    }
}

async function updateMondayBoardDoneStatus(bodyJSON) {
    try {
        const courseId = bodyJSON['course_id'];
        const action = bodyJSON['action'];
        const needsConversion = bodyJSON['needs_conversion'];

        let item_id = 0;
        console.log(bodyJSON);
        console.log(action === "updateMondayBoard");
        if (action === "updateMondayBoard") {
            const getBoardDataQuery = `query{
                boards (ids:1206883120){
                    name
                    items_page {
                        cursor
                        items {
                            id
                            name
                            column_values {
                                id
                                column {
                                id
                                title
                                }
                                value
                                text
                            }
                        }
                    }
                }
            }`;

            const rowData = await addOrGetValuesOfBoard(getBoardDataQuery);
            const items = rowData["data"]["boards"][0]["items_page"]["items"];
            let url = '';

            let flag = false;

            for (const item of items) {
                const column_values = item['column_values'];
                for (const obj of column_values) {
                    if (obj['column']['title'] === "Course URL" && obj['text'].includes(courseId.toString())) {
                        item_id = item['id'];
                        flag = true;
                        break;
                    }
                }
                if (flag) {
                    break;
                }
            }

            const column_value = {
                "status": needsConversion ? "Needs Conversion" : "Done"
            };

            const addNewURLDataQuery = `mutation {
                change_multiple_column_values (board_id: 1206883120, item_id: ${item_id}, column_values:${JSON.stringify(JSON.stringify(column_value))} ) {
                    id
                }
            }`;

            console.log(addNewURLDataQuery);
            await addOrGetValuesOfBoard(addNewURLDataQuery);

            return {
                'statusCode': 200,
                'body': JSON.stringify("Successfully updated")
            };
        }

        return {
            'statusCode': 200,
            'body': JSON.stringify("failed while updating the board")
        };
    }
    catch(error){
        console.log(error)
    }
}

app.get('/', function(req, res){
    res.json({
        status: 200,
        message: "server is up and running"
    });
})

app.post('/main', async (req, res) => {
    try {
        console.log(req.body);

        let bodyJSON;

        if (isBase64Encoded(req.body)) {
            const decoded_bytes = Buffer.from(req.body, 'base64');
            const decoded_string = decoded_bytes.toString('utf-8');
            bodyJSON = JSON.parse(decoded_string);
            console.log(bodyJSON);
        } else if (typeof req.body === 'object') {
            bodyJSON = req.body;
        } else {
            bodyJSON = JSON.parse(req.body);
        }

        console.log('mark_as_unusable' in bodyJSON);
        console.log(bodyJSON);

        if (bodyJSON !== null && 'mark_as_unusable' in bodyJSON) {
            console.log(bodyJSON);
            await manageUnusableImage(bodyJSON);
        } 
        else if (bodyJSON !== null && 'event' in bodyJSON) {
            res.json(await getMethodHandler(bodyJSON));
        } else if (bodyJSON !== null && 'challenge' in bodyJSON) {
            console.log(await postMethodHandler(req));
            res.json(await postMethodHandler(req));
        } else if (bodyJSON !== null && 'action' in bodyJSON) {
            res.json(await updateMondayBoardDoneStatus(bodyJSON));
        } else if (bodyJSON !== null && 'reset' in bodyJSON) {
            res.json(await resetAllTheUsers());
        } else {
            res.json({
                'statusCode': 200,
                'body': JSON.stringify("Not a valid request")
            });
        }
    }
    catch(error){
        console.log(error)
    }
});

app.listen(port, () => {
    console.log("server running on port 3004");
});
