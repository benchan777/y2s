let tabUrl;

chrome.runtime.onMessage.addListener( (message, sender) => {
  if (message.message == 'get music') {
    tabUrl = message.url;
    getMusic();
  };
})

async function getMusic() {
	const accessTokenTime = await getLocalValue("timeStamp");
	const timeDifference = await elapsedTime(accessTokenTime.timeStamp);

	// Generate new tokens if 50 min has elapsed since generation of last access token
	if (timeDifference > 3000) {
		const refreshToken = await getLocalValue("refreshToken");
		const newToken = await getNewTokens(refreshToken.refreshToken);

		// Store refreshed access token in database
		chrome.storage.sync.set(
			{
				refreshToken: newToken.refresh_token,
				accessToken: newToken.access_token,
				timeStamp: Date.now(),
			},
			() => {
				console.log("new access token stored successfully");
			}
		);
	}

	const accessToken = await getLocalValue("accessToken");
	const data = { videoUrl: tabUrl, accessToken: accessToken.accessToken };

	fetch(`http://localhost:3000/api/like_song`, {
		method: "POST",
		mode: "cors",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(data),
	})
		.then((response) => {
			return response.json();
		})
		.then((data) => {
			// chrome.runtime.sendMessage(data, (res) => {
			// 	console.log("Track data sent to extension.");
			// });
      if (data.error) {
        songNotFound();
      };

      if (data.title) {
        songAdded(data);
      };
		})
		.catch((error) => {
			console.log(error);
		});
}

// Retrieve data stored in local storage. Find item by key
async function getLocalValue(key) {
	return new Promise((resolve, reject) => {
		chrome.storage.sync.get(key, (data) => {
			resolve(data);
		});
	});
}

// Get time difference between current time and time the last accessToken was generated
async function elapsedTime(tokenTimestamp) {
	return new Promise((resolve, reject) => {
		const curentTime = Date.now();
		const timeDifference = (curentTime - tokenTimestamp) / 1000;
		resolve(timeDifference);
	});
}

// Generate new accessToken & refreshToken when old accessToken has expired
// Refresh tokens obtained using PKCE auth flow can be exchanged for an access token only
// once, so a new refresh token must be generated and stored each time
async function getNewTokens(refreshToken) {
	return new Promise((resolve, reject) => {
		const grant_type = "refresh_token";
		const client_id = "cc9e2365a9c1461ea9a251d446f347d0";

		const queryString =
			"https://accounts.spotify.com/api/token" +
			`?client_id=${client_id}` +
			`&grant_type=${grant_type}` +
			`&refresh_token=${refreshToken}`;

		fetch(queryString, {
			method: "POST",
			mode: "cors",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
		})
			.then((response) => response.json())
			.then((data) => {
				// console.log(data)
				resolve(data);
			})
			.catch((error) => {
				reject(error);
			});
	});
}

// When song is found and added successfully to Spotify, the data is stored in local storage.
// This is used so that the information can be viewed on the chrome extension popup.
function songAdded(data) {
  chrome.storage.sync.set({
    addedSongTitle: data.title,
    addedSongArtist: data.artist,
    songAddedTime: Date.now()
  })

  // Send notification to desktop
  chrome.notifications.create('Song added!', {
    type: 'basic',
    iconUrl: '../images/icon32.png',
    title: 'Song added to Spotify!',
    message: `${data.title} by ${data.artist} has been added to your liked songs on Spotify!`
  }, () => {
    console.log('notification sent!')
  })

  // Show notification badge
  chrome.action.setBadgeBackgroundColor({ color: 'red'});
  chrome.action.setBadgeText({ text: '1'});
};

// Delete song info from local storage if song is not successfully added to Spotify. This
// will trigger the chrome popup to notify the user that the song was not found and therefore
// unable to be added.
function songNotFound() {
  chrome.storage.sync.remove(['addedSongTitle', 'addedSongArtist', 'songAddedTime' ], () => {
    chrome.storage.sync.set({ error: 'Song not found' })
    chrome.notifications.create('Song not found', {
      type: 'basic',
      iconUrl: '../images/icon32.png',
      title: 'Song not found',
      message: `Unfortunately, the song could not be found so nothing was added to your liked songs list on Spotify.`
    }, () => {
      console.log('song not found notification sent!')
    })
  });
};