const slugify = require("slugify");
const Page = require("../models/Page");
const sendResponse = require("../utils/response");
const { logActivity } = require("../utils/activityLogger");

const normalizeSlug = (value) => {
  return slugify(String(value || ""), { lower: true, strict: true, trim: true });
};

const createPage = async (req, res) => {
  try {
    const {
      title,
      slug,
      pageType,
      status,
      seoTitle,
      seoDescription,
      seoKeywords,
      featuredImage,
      sections
    } = req.body;

    if (!title || !slug) {
      return sendResponse(res, 400, false, "Title and slug are required");
    }

    const normalizedSlug = normalizeSlug(slug);

    const existingPage = await Page.findOne({ slug: normalizedSlug });
    if (existingPage) {
      return sendResponse(res, 400, false, "Page slug already exists");
    }

    const page = await Page.create({
      title,
      slug: normalizedSlug,
      pageType: pageType || "page",
      status: status || "draft",
      seoTitle: seoTitle || "",
      seoDescription: seoDescription || "",
      seoKeywords: Array.isArray(seoKeywords) ? seoKeywords : [],
      featuredImage: featuredImage || "",
      sections: Array.isArray(sections) ? sections : [],
      createdBy: req.admin._id,
      updatedBy: req.admin._id
    });

    await logActivity({
      admin: req.admin._id,
      action: "PAGE_CREATED",
      module: "PAGE",
      description: `Page created: ${page.title}`,
      entityId: page._id.toString(),
      entityType: "Page",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    const createdPage = await Page.findById(page._id)
      .populate("createdBy", "name email role")
      .populate("updatedBy", "name email role");

    return sendResponse(res, 201, true, "Page created successfully", createdPage);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const getAllPages = async (req, res) => {
  try {
    const {
      search,
      pageType,
      status,
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc"
    } = req.query;

    const query = {};

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { slug: { $regex: search, $options: "i" } },
        { seoTitle: { $regex: search, $options: "i" } },
        { seoDescription: { $regex: search, $options: "i" } }
      ];
    }

    if (pageType) {
      query.pageType = pageType;
    }

    if (status) {
      query.status = status;
    }

    const currentPage = Number(page) > 0 ? Number(page) : 1;
    const pageLimit = Number(limit) > 0 ? Number(limit) : 10;
    const skip = (currentPage - 1) * pageLimit;
    const sortDirection = sortOrder === "asc" ? 1 : -1;

    const pages = await Page.find(query)
      .populate("createdBy", "name email role")
      .populate("updatedBy", "name email role")
      .sort({ [sortBy]: sortDirection })
      .skip(skip)
      .limit(pageLimit);

    const totalItems = await Page.countDocuments(query);

    return sendResponse(res, 200, true, "Page list fetched successfully", {
      pages,
      pagination: {
        totalItems,
        currentPage,
        totalPages: Math.ceil(totalItems / pageLimit),
        pageLimit
      }
    });
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const getPageById = async (req, res) => {
  try {
    const page = await Page.findById(req.params.id)
      .populate("createdBy", "name email role")
      .populate("updatedBy", "name email role");

    if (!page) {
      return sendResponse(res, 404, false, "Page not found");
    }

    return sendResponse(res, 200, true, "Page fetched successfully", page);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const updatePage = async (req, res) => {
  try {
    const page = await Page.findById(req.params.id);
    if (!page) {
      return sendResponse(res, 404, false, "Page not found");
    }

    const {
      title,
      slug,
      pageType,
      status,
      seoTitle,
      seoDescription,
      seoKeywords,
      featuredImage,
      sections
    } = req.body;

    if (slug !== undefined) {
      const normalizedSlug = normalizeSlug(slug);
      if (normalizedSlug !== page.slug) {
        const existingPage = await Page.findOne({ slug: normalizedSlug });
        if (existingPage) {
          return sendResponse(res, 400, false, "Page slug already exists");
        }
        page.slug = normalizedSlug;
      }
    }

    if (title !== undefined) page.title = title;
    if (pageType !== undefined) page.pageType = pageType;
    if (status !== undefined) page.status = status;
    if (seoTitle !== undefined) page.seoTitle = seoTitle;
    if (seoDescription !== undefined) page.seoDescription = seoDescription;
    if (seoKeywords !== undefined) page.seoKeywords = Array.isArray(seoKeywords) ? seoKeywords : [];
    if (featuredImage !== undefined) page.featuredImage = featuredImage;
    if (sections !== undefined) page.sections = Array.isArray(sections) ? sections : [];

    page.updatedBy = req.admin._id;
    await page.save();

    await logActivity({
      admin: req.admin._id,
      action: "PAGE_UPDATED",
      module: "PAGE",
      description: `Page updated: ${page.title}`,
      entityId: page._id.toString(),
      entityType: "Page",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    const updatedPage = await Page.findById(page._id)
      .populate("createdBy", "name email role")
      .populate("updatedBy", "name email role");

    return sendResponse(res, 200, true, "Page updated successfully", updatedPage);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const deletePage = async (req, res) => {
  try {
    const page = await Page.findById(req.params.id);
    if (!page) {
      return sendResponse(res, 404, false, "Page not found");
    }

    page.status = "draft";
    page.updatedBy = req.admin._id;
    await page.save();

    await logActivity({
      admin: req.admin._id,
      action: "PAGE_DELETED",
      module: "PAGE",
      description: `Page moved to draft: ${page.title}`,
      entityId: page._id.toString(),
      entityType: "Page",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent")
    });

    return sendResponse(res, 200, true, "Page deleted successfully", page);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const getPublicPageBySlug = async (req, res) => {
  try {
    const page = await Page.findOne({
      slug: req.params.slug,
      status: "published"
    });

    if (!page) {
      return sendResponse(res, 404, false, "Page not found");
    }

    return sendResponse(res, 200, true, "Public page fetched successfully", page);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

const getPublicPages = async (req, res) => {
  try {
    const query = { status: "published" };

    if (req.query.pageType) {
      query.pageType = req.query.pageType;
    }

    const pages = await Page.find(query)
      .select("title slug pageType seoTitle seoDescription featuredImage")
      .sort({ createdAt: -1 });

    return sendResponse(res, 200, true, "Public pages fetched successfully", pages);
  } catch (error) {
    return sendResponse(res, 500, false, error.message);
  }
};

module.exports = {
  createPage,
  getAllPages,
  getPageById,
  updatePage,
  deletePage,
  getPublicPageBySlug,
  getPublicPages
};
