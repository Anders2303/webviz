from typing import List

import httpx
from dotenv import load_dotenv
from webviz_pkg.core_utils.perf_timer import PerfTimer

from primary import config

load_dotenv()


def __make_headers(access_token: str) -> dict:
    return {
        "Content-Type": "application/json",
        "authorization": f"Bearer {access_token}",
        "Ocp-Apim-Subscription-Key": config.SMDA_SUBSCRIPTION_KEY,
    }


async def get(access_token: str, endpoint: str, params: dict) -> List[dict]:
    """
    Generic GET request to SMDA API.
    Uses `next` pagination to get all results.
    https://smda.equinor.com/learn/develop/smda-rest-api/#_next
    """
    urlstring = f"https://api.gateway.equinor.com/smda/v2.0/smda-api/{endpoint}?"
    params = params if params else {}
    params.update({"_items": 10000})
    headers = __make_headers(access_token)
    timer = PerfTimer()

    async with httpx.AsyncClient() as client:
        response = await client.get(urlstring, params=params, headers=headers, timeout=60)
        results = []
        if response.status_code == 200:
            results = response.json()["data"]["results"]
            next_request = response.json()["data"]["next"]
            while next_request is not None:
                params["_next"] = next_request
                response = await client.get(urlstring, params=params, headers=headers, timeout=60)
                result = response.json()["data"]["results"]
                if result:
                    results.extend(response.json()["data"]["results"])
                next_request = response.json()["data"]["next"]
        elif response.status_code == 404:
            print(f"{str(response.status_code) } {endpoint} either does not exists or can not be found")
        else:
            print(f"[WARNING:] Can not fetch data from endpont {endpoint}  ({ str(response.status_code)})")
        print(f"TIME SMDA fetch {endpoint} took {timer.lap_s():.2f} seconds")

    return results


async def get_aggregations(access_token: str, endpoint: str, params: dict) -> dict:
    """
    Runs an aggregation request on the SMDA API.
    https://smda.equinor.com/learn/develop/smda-rest-api/#_next
    """
    urlstring = f"https://api.gateway.equinor.com/smda/v2.0/smda-api/{endpoint}?"
    headers = __make_headers(access_token)
    timer = PerfTimer()

    params = params if params else {}
    params.update({"_items": 0})  # Since we only care about aggregations, so no items are needed

    if "_aggregation" not in params.keys():
        raise ValueError("Aggregations parameter required.")

    async with httpx.AsyncClient() as client:
        response = await client.get(urlstring, params=params, headers=headers, timeout=60)

        aggregations = {}

        if response.status_code == 200:
            aggregations = response.json()["data"]["aggregations"]
        elif response.status_code == 404:
            print(f"{str(response.status_code) } {endpoint} either does not exists or can not be found")
        else:
            print(f"[WARNING:] Can not fetch data from endpont {endpoint}  ({ str(response.status_code)})")

    print(f"TIME SMDA fetch {endpoint} took {timer.lap_s():.2f} seconds")
    return aggregations
