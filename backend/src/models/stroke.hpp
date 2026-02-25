#pragma once

#include <string>
#include <vector>
#include <utility>
#include <cstdint>

namespace collabboard {

/**
 * @brief A single point in a stroke.
 */
struct Point {
    float x;
    float y;

    Point() : x(0.0f), y(0.0f) {}
    Point(float xPos, float yPos) : x(xPos), y(yPos) {}
};

/**
 * @brief Represents a drawing stroke on the whiteboard.
 */
struct Stroke {
    std::string strokeId;        // Unique identifier
    std::string oderId;         // Who drew it
    std::vector<Point> points;   // x,y coordinates
    std::string color;           // Hex color code
    float width;                 // Stroke width in pixels
    bool complete;               // true if stroke_end received
    uint64_t seq;                // Sequence number for ordering

    Stroke()
        : width(2.0f)
        , complete(false)
        , seq(0)
    {}

    Stroke(const std::string& id, const std::string& oderId, 
           const std::string& col, float w)
        : strokeId(id)
        , oderId(oderId)
        , color(col)
        , width(w)
        , complete(false)
        , seq(0)
    {}

    /**
     * @brief Add a single point to the stroke.
     */
    void addPoint(float x, float y) {
        points.emplace_back(x, y);
    }

    /**
     * @brief Add multiple points to the stroke.
     */
    void addPoints(const std::vector<Point>& newPoints) {
        points.insert(points.end(), newPoints.begin(), newPoints.end());
    }

    /**
     * @brief Mark the stroke as complete.
     */
    void finish() {
        complete = true;
    }

    /**
     * @brief Translate all points by dx, dy.
     */
    void translate(float dx, float dy) {
        for (auto& pt : points) {
            pt.x += dx;
            pt.y += dy;
        }
    }

    /**
     * @brief Get the number of points in the stroke.
     */
    size_t pointCount() const {
        return points.size();
    }

    /**
     * @brief Check if stroke is empty (no points).
     */
    bool isEmpty() const {
        return points.empty();
    }

    /**
     * @brief Estimate memory size of this stroke in bytes.
     */
    size_t estimateSize() const {
        return sizeof(Stroke) + 
               strokeId.capacity() + 
               oderId.capacity() + 
               color.capacity() +
               points.capacity() * sizeof(Point);
    }
};

} // namespace collabboard
