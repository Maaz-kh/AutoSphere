const BASE_URL = 'http://localhost:5000';

async function testPostServiceRecord() {
  const payload = {
    vehicleId: 'ABC-124',
    report: {
      // workshopId: 'workshop_x',
      // dateTime: '2025-11-27T12:00:00Z',
      // odometer: 83000,
      // replacedParts: [
      //   { name: 'Oil Filter', price: 1200 },
      //   { name: 'Engine Oil', price: 4500 }
      // ],
      // updatedParts: [
      //   { name: 'Oil Filter', price: 1200 },
      //   { name: 'Engine Oil', price: 4500 }
      // ],
      laborCharges: 1500,
      totalCharges: 6000,
      description: 'Oil change and general inspection'
    }
  };

  try {
    const response = await fetch(`${BASE_URL}/service-record`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    console.log('POST /service-record Response:', data);
  } catch (error) {
    console.error('Error in POST test:', error);
  }
}

async function testGetServiceRecords() {
  try {
    const response = await fetch(`${BASE_URL}/service-record/ABC-124`);
    const data = await response.json();
    console.log('GET /service-record/:vehicleId Response:');
    console.log(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error in GET test:', error);
  }
}

async function runTests() {
  console.log('Running API Tests...');

  await testPostServiceRecord();
  await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for transaction
  await testGetServiceRecords();

  console.log('Tests completed.');
}

runTests();
