const queryString = require("query-string");
const utils = require("./utils");
const helpers = require("./getDatasetHelpers");
const {NoDatasetPathError} = require("./exceptions");

/**
 *
 * @param {*} res
 * @param {*} datasetInfo
 * @param {*} query
 */
const requestCertainFileType = async (res, req, datasetInfo, query) => {
  const jsonData = await utils.fetchJSON(datasetInfo.fetchUrls.additional);
  if (query.type === "tree") {
    res.json({tree: jsonData});
  }
  res.json(jsonData);
};

/**
 * Currently the main datasets are tree + meta
 *
 * @param {*} datasetInfo
 * @param {*} query
 */
const requestMainDataset = async (res, req, datasetInfo) => {
  const fetchMultiple = [utils.fetchJSON(datasetInfo.fetchUrls.meta),
    utils.fetchJSON(datasetInfo.fetchUrls.tree)];

  if (datasetInfo.fetchUrls.secondTree) {
    fetchMultiple.push(utils.fetchJSON(datasetInfo.fetchUrls.secondTree));
  }

  const data = await Promise.all(fetchMultiple);

  const jsonData = {
    meta: data[0],
    tree: data[1],
    _source: datasetInfo.source.name,
    _treeName: datasetInfo.treeName
  };

  if (datasetInfo.fetchUrls.secondTree) {
    jsonData._treeTwoName = datasetInfo.secondTreeName;
    jsonData.treeTwo = data[2];
  }

  utils.verbose(`Success fetching ${fetchMultiple.length} version 1 auspice JSONs. Sending as a single JSON.`);
  res.send(jsonData);
};

const getDataset = async (req, res) => {
  const query = queryString.parse(req.url.split('?')[1]);
  if (!query.prefix) {
    return helpers.handleError(res, `getDataset request must define a prefix`);
  }
  utils.log(`Getting (nextstrain) datasets for: ${req.url.split('?')[1]}`);

  // construct fetch URL
  let datasetInfo;
  try {
    datasetInfo = helpers.parsePrefix(query.prefix, query);
    utils.verbose("Dataset: ", datasetInfo);
  } catch (err) {
    /* Return a 204 No Content when Auspice makes a dataset request to a
     * valid source root without a dataset path.
     *
     * Note that this leaks the existence of private sources, but I think
     * broader discussions are leaning towards that anyhow.
     */
    if (err instanceof NoDatasetPathError) {
      utils.verbose(err.message);
      return res.status(204).end();
    }
    return helpers.handleError(res, `Couldn't parse the url "${query.prefix}"`, err.message);
  }

  // Authorization
  if (!datasetInfo.source.visibleToUser(req.user)) {
    return helpers.unauthorized(req, res);
  }

  if (datasetInfo.fetchUrls.additional) {
    try {
      await requestCertainFileType(res, req, datasetInfo, query);
    } catch (err) {
      return helpers.handleError(res, `Couldn't fetch JSON: ${datasetInfo.fetchUrls.additional}`, err.message);
    }
  } else {
    try {
      await requestMainDataset(res, req, datasetInfo);
    } catch (err) {
      return helpers.handleError(res, `Couldn't fetch JSONs`, err.message);
    }
  }
  return undefined;
};

module.exports = {
  getDataset,
  default: getDataset
};
