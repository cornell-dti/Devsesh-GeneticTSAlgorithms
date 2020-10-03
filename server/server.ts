import express = require('express');

// Create a new express app instance
const app: express.Application = express();
app.get('/', function (req, res) {
  res.sendFile(__dirname + '/public/index.html');
});

app.use(express.static(__dirname + '/public'));

app.listen(3000, function () {
  console.log('App is listening on port 3000!');
});