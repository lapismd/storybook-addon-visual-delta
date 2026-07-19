import React, { memo, useCallback } from "react";
import type { VisualDeltaImage } from "../constants.js";
import {
  GalleryContainer,
  ImagesScrollContainer,
  ImageWrapper,
  ThumbImage,
} from "./styled.js";

export const ImageGallery = memo(function ImageGallery({
  images,
  selectedIndex,
  onSelect,
}: {
  images: VisualDeltaImage[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  const handleImageClick = useCallback(
    (index: number) => {
      onSelect(index === selectedIndex ? -1 : index);
    },
    [selectedIndex, onSelect],
  );

  return (
    <GalleryContainer>
      <ImagesScrollContainer>
        {images.map((imageItem, index) => (
          <ImageWrapper
            key={index}
            selected={selectedIndex === index}
            onClick={() => handleImageClick(index)}
            title={`Select image ${index + 1}`}
          >
            <ThumbImage src={imageItem.src} alt={`Baseline ${index + 1}`} />
          </ImageWrapper>
        ))}
      </ImagesScrollContainer>
    </GalleryContainer>
  );
});
